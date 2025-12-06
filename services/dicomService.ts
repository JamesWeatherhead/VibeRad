import { Study, Series, DicomWebConfig, DiagnosticStep } from "../types";

// DICOM Tags Mapping
const TAG = {
  PATIENT_NAME: "00100010",
  PATIENT_ID: "00100020",
  STUDY_DATE: "00080020",
  ACCESSION_NUMBER: "00080050",
  STUDY_DESC: "00081030",
  MODALITY: "00080060",
  STUDY_INSTANCE_UID: "0020000D",
  SERIES_INSTANCE_UID: "0020000E",
  SERIES_DESC: "0008103E",
  SERIES_NUMBER: "00200011",
  INSTANCE_NUMBER: "00200013", // NEW: For Sorting
  NUMBER_OF_SERIES: "00201206",
  NUMBER_OF_INSTANCES: "00201209",
  NUMBER_OF_STUDY_RELATED_INSTANCES: "00201208", // NEW
  SOP_INSTANCE_UID: "00080018",
};

/**
 * Helper to safely extract values from DICOM JSON structure.
 */
const getValue = (obj: any, tag: string, defaultValue = ""): string => {
  const element = obj[tag];
  if (!element || !element.Value || element.Value.length === 0) return defaultValue;
  
  const val = element.Value[0];
  if (typeof val === 'object') {
    if (val.Alphabetic) return val.Alphabetic;
    return defaultValue;
  }
  return String(val);
};

/**
 * Builds the URL, wrapping it in a CORS proxy if configured.
 */
const getEffectiveUrl = (config: DicomWebConfig, path: string): string => {
  const cleanBase = config.url.replace(/\/$/, '');
  const fullUrl = `${cleanBase}${path}`;
  
  if (config.useCorsProxy) {
    return `https://corsproxy.io/?${encodeURIComponent(fullUrl)}`;
  }
  return fullUrl;
};

/**
 * Fetch with timeout to prevent hanging tests
 */
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 15000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

/**
 * Fetches a rendered image as a Blob directly.
 * Implements "Smart Fallback" strategies to handle various server quirks.
 */
export const fetchDicomImageBlob = async (config: DicomWebConfig, url: string): Promise<Blob> => {
  if (!url) throw new Error("Image URL is undefined");
  const errors: string[] = [];

  // Helper to try a fetch
  const tryFetch = async (fetchUrl: string, headers: HeadersInit, description: string) => {
      try {
        const response = await fetchWithTimeout(fetchUrl, {
            mode: 'cors',
            headers: headers
        }, 8000);
        
        if (response.ok) {
            const blob = await response.blob();
            // Loose check for image type (handles image/jpeg;charset=utf-8)
            if (blob.type.includes('image')) return blob; 
            errors.push(`${description} returned wrong MIME: ${blob.type}`);
        } else {
            errors.push(`${description} failed: ${response.status}`);
        }
      } catch (e: any) {
        errors.push(`${description} error: ${e.message}`);
      }
      return null;
  };

  // STRATEGY 1: Standard Instance Rendered (Accept Header)
  let blob = await tryFetch(url, { 'Accept': 'image/jpeg' }, "Strategy A (Header)");
  if (blob) return blob;

  // STRATEGY 2: Query Param (Accept URL param)
  // Some servers ignore headers and require ?accept=image/jpeg
  const queryChar = url.includes('?') ? '&' : '?';
  const queryUrl = `${url}${queryChar}accept=image/jpeg`;
  blob = await tryFetch(queryUrl, {}, "Strategy B (Query)");
  if (blob) return blob;

  // STRATEGY 3: Frame 1 Specific Render (Common fix for 400 Bad Request on Instance Level)
  // Convert .../instances/{uid}/rendered -> .../instances/{uid}/frames/1/rendered
  // We use a regex check to handle Proxy URLs correctly (which might not end with /rendered)
  if (url.match(/\/instances\/[^\/]+\/rendered/)) {
      const frameUrl = url.replace(/\/rendered/, '/frames/1/rendered');
      
      // 3a. Frame 1 with Header
      blob = await tryFetch(frameUrl, { 'Accept': 'image/jpeg' }, "Strategy C (Frame 1 Header)");
      if (blob) return blob;
      
      // 3b. Frame 1 with Query Param
      const frameQueryChar = frameUrl.includes('?') ? '&' : '?';
      const frameQueryUrl = `${frameUrl}${frameQueryChar}accept=image/jpeg`;
      blob = await tryFetch(frameQueryUrl, {}, "Strategy D (Frame 1 Query)");
      if (blob) return blob;
  }

  // If we get here, all failed
  console.error("All image fetch strategies failed:", errors);
  throw new Error("Failed to render image. Server returned non-image data or failed (400/404).");
};


const PROXY_PING_TARGETS = [
  { url: 'https://www.cloudflare.com/cdn-cgi/trace', name: 'Cloudflare Edge' },
  { url: 'https://jsonplaceholder.typicode.com/posts/1', name: 'JSONPlaceholder' },
];

/**
 * UNIT TEST: Proxy Binary Transparency
 * Ensures the proxy doesn't corrupt binary data (images) by trying to parse them as text.
 */
const testProxyBinaryTransparency = async (): Promise<boolean> => {
  try {
    // 1x1 Pixel Transparent GIF
    const testImageUrl = 'https://upload.wikimedia.org/wikipedia/commons/c/ca/1x1.png'; 
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(testImageUrl)}`;
    
    const response = await fetchWithTimeout(proxyUrl, { method: 'GET' }, 5000);
    if (!response.ok) return false;
    
    const blob = await response.blob();
    // Verify it is still an image and has content
    return (blob.size > 0 && blob.type.includes('image'));
  } catch (e) {
    console.warn("Proxy Binary Test Failed", e);
    return false;
  }
};

/**
 * Run a suite of unit tests against the DICOMweb server
 */
export const runConnectionDiagnostics = async (
  config: DicomWebConfig, 
  onStepUpdate: (stepId: string, status: DiagnosticStep['status'], message?: string) => void
): Promise<boolean> => {
  const log = (step: string, msg: string) => console.log(`[Diagnostic: ${step}] ${msg}`);
  const testPath = '/studies?limit=1';

  // --- STEP 1: NETWORK / PROXY ---
  if (config.useCorsProxy) {
    onStepUpdate('1-network', 'RUNNING');
    try {
      // Subtest 1: Service Availability
      let proxyUp = false;
      for (const target of PROXY_PING_TARGETS) {
         const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(target.url)}`;
         try {
           const res = await fetchWithTimeout(proxyUrl, { method: 'GET' }, 5000);
           if (res.ok) { proxyUp = true; break; }
         } catch(e) {}
      }
      
      if (!proxyUp) throw new Error("corsproxy.io is unreachable");

      // Subtest 2: Binary Transparency (New)
      const binaryWorks = await testProxyBinaryTransparency();
      if (!binaryWorks) throw new Error("Proxy corrupts binary data (Images may fail)");

      onStepUpdate('1-network', 'PASS', `Proxy Online & Binary-Ready`);
    } catch (e: any) {
      onStepUpdate('1-network', 'FAIL', `Proxy Error: ${e.message}`);
      return false; 
    }
  } else {
    onStepUpdate('1-network', 'RUNNING');
    try {
       // Simple ping
       const url = getEffectiveUrl(config, testPath);
       await fetchWithTimeout(url, { method: 'GET', mode: 'no-cors' });
       onStepUpdate('1-network', 'PASS', "Server Reachable");
    } catch (e: any) {
       onStepUpdate('1-network', 'FAIL', "Server Unreachable");
       return false;
    }
  }

  // --- STEP 2: CORS / CONNECT ---
  onStepUpdate('2-connect', 'RUNNING');
  try {
    const url = getEffectiveUrl(config, testPath);
    const resp = await fetchWithTimeout(url, { method: 'GET', mode: 'cors' });
    if (resp.status === 401 || resp.status === 403) {
      onStepUpdate('2-connect', 'PASS', `Connected (HTTP ${resp.status})`);
    } else if (!resp.ok && resp.status !== 200 && resp.status !== 204) {
      throw new Error(`HTTP ${resp.status}`);
    } else {
      onStepUpdate('2-connect', 'PASS', "Connection Established");
    }
  } catch (e: any) {
    onStepUpdate('2-connect', 'FAIL', `Connection Blocked: ${e.message}`);
    return false;
  }

  // --- STEP 3: PROTOCOL (QIDO-RS) ---
  // We test both Simple and Complex to pinpoint why OHIF/IDC fail
  onStepUpdate('3-qido', 'RUNNING');
  let firstStudyUid = '';
  
  try {
    // 3a. Simple Query (Just Studies)
    const simpleUrl = getEffectiveUrl(config, '/studies?limit=1');
    const simpleResp = await fetchWithTimeout(simpleUrl, { headers: { 'Accept': 'application/dicom+json' } });

    if (!simpleResp.ok) throw new Error(`Simple Query failed: ${simpleResp.status}`);
    
    // 3b. Complex Query (Includes extra fields)
    const complexParams = `?limit=1&includefield=${TAG.NUMBER_OF_STUDY_RELATED_INSTANCES}&includefield=${TAG.ACCESSION_NUMBER}`;
    const complexUrl = getEffectiveUrl(config, `/studies${complexParams}`);
    const complexResp = await fetchWithTimeout(complexUrl, { headers: { 'Accept': 'application/dicom+json' } });
    
    if (!complexResp.ok) {
        onStepUpdate('3-qido', 'PASS', `Partial Support (Advanced filters failed: ${complexResp.status})`);
        // We still consider this a PASS because "Downgrade Strategy" in searchDicomWebStudies will handle it
    } else {
        onStepUpdate('3-qido', 'PASS', "Full Protocol Support");
    }

    const json = await simpleResp.json();
    if (json.length > 0) firstStudyUid = getValue(json[0], TAG.STUDY_INSTANCE_UID);

  } catch (e: any) {
     onStepUpdate('3-qido', 'FAIL', `Protocol Error: ${e.message}`);
     return false;
  }

  // --- STEP 4: IMAGE RENDERING (WADO-RS) ---
  let firstSeriesUid = '';
  let firstInstanceUid = '';

  if (firstStudyUid) {
    onStepUpdate('4-wado', 'RUNNING', 'Checking Rendering Strategies...');
    try {
       // 1. Get Series
       const seriesUrl = getEffectiveUrl(config, `/studies/${firstStudyUid}/series?limit=1`);
       const sResp = await fetchWithTimeout(seriesUrl, { headers: { 'Accept': 'application/dicom+json' } });
       const sJson = await sResp.json();
       
       if (sJson.length > 0) {
         firstSeriesUid = getValue(sJson[0], TAG.SERIES_INSTANCE_UID);
         
         // 2. Get Instance
         const instUrl = getEffectiveUrl(config, `/studies/${firstStudyUid}/series/${firstSeriesUid}/instances?limit=1`);
         const iResp = await fetchWithTimeout(instUrl, { headers: { 'Accept': 'application/dicom+json' } });
         const iJson = await iResp.json();

         if (iJson.length > 0) {
            firstInstanceUid = getValue(iJson[0], TAG.SOP_INSTANCE_UID);
            const renderPath = `/studies/${firstStudyUid}/series/${firstSeriesUid}/instances/${firstInstanceUid}/rendered`;
            const renderUrl = getEffectiveUrl(config, renderPath);
            
            // Re-use logic: Standard, Query, then Frame Fallback
            let success = false;
            
            try {
               const res = await fetchWithTimeout(renderUrl, { mode: 'cors', headers: { 'Accept': 'image/jpeg' } }, 5000);
               const blob = await res.blob();
               if (blob.type.includes('image')) {
                  onStepUpdate('4-wado', 'PASS', "Pass (Standard Header)");
                  success = true;
               } 
            } catch (e) { /* ignore */ }

            if (!success) {
                try {
                   const queryUrl = renderUrl.includes('?') ? `${renderUrl}&accept=image/jpeg` : `${renderUrl}?accept=image/jpeg`;
                   const res = await fetchWithTimeout(queryUrl, { mode: 'cors' }, 5000);
                   const blob = await res.blob();
                   if (blob.type.includes('image')) {
                      onStepUpdate('4-wado', 'PASS', "Pass (Query Param)");
                      success = true;
                   }
                } catch (e) { /* ignore */ }
            }

            // C: Frame Fallback
            if (!success) {
              try {
                 const frameUrl = renderUrl.replace(/\/rendered/, '/frames/1/rendered');
                 const res = await fetchWithTimeout(frameUrl, { mode: 'cors', headers: { 'Accept': 'image/jpeg' } }, 5000);
                 const blob = await res.blob();
                 if (blob.type.includes('image')) {
                    onStepUpdate('4-wado', 'PASS', "Pass (Frame 1 Fallback)");
                    success = true;
                 }
              } catch (e) { /* ignore */ }
            }

            if (!success) {
                onStepUpdate('4-wado', 'FAIL', "Render Failed (MIME/400)");
                // We return true anyway to let user proceed with caution
            }

         } else {
            onStepUpdate('4-wado', 'PASS', "Skipped (No Instances)");
         }
       } else {
         onStepUpdate('4-wado', 'PASS', "Skipped (No Series)");
       }
    } catch (e: any) {
        onStepUpdate('4-wado', 'FAIL', `Render Failed: ${e.message}`);
        return true; 
    }
  } else {
    onStepUpdate('4-wado', 'PASS', "Skipped (Empty DB)");
  }

  // --- STEP 5: SERIES INTEGRITY Check ---
  if (firstStudyUid && firstSeriesUid) {
      onStepUpdate('5-integrity', 'RUNNING');
      try {
          // Check metadata count vs returned count to detect pagination limits
          // Retrieve Series Metadata
          const seriesUrl = getEffectiveUrl(config, `/studies/${firstStudyUid}/series?SeriesInstanceUID=${firstSeriesUid}`);
          const sResp = await fetchWithTimeout(seriesUrl, { headers: { 'Accept': 'application/dicom+json' } });
          const sJson = await sResp.json();
          const expectedCount = parseInt(getValue(sJson[0], TAG.NUMBER_OF_INSTANCES, "0"));
          
          if (expectedCount > 0) {
             // Fetch all instances
             const instUrl = getEffectiveUrl(config, `/studies/${firstStudyUid}/series/${firstSeriesUid}/instances?limit=2000`);
             const iResp = await fetchWithTimeout(instUrl, { headers: { 'Accept': 'application/dicom+json' } });
             const iJson = await iResp.json();
             const actualCount = iJson.length;

             if (actualCount < expectedCount) {
                 onStepUpdate('5-integrity', 'FAIL', `Truncated: Got ${actualCount}/${expectedCount} (Server Limit)`);
             } else {
                 onStepUpdate('5-integrity', 'PASS', `Integrity OK (${actualCount} images)`);
             }
          } else {
              onStepUpdate('5-integrity', 'PASS', "Skipped (No Count Metadata)");
          }

      } catch (e: any) {
          onStepUpdate('5-integrity', 'PASS', "Skipped (Metadata Error)");
      }
  } else {
     onStepUpdate('5-integrity', 'PASS', "Skipped");
  }

  return true;
};

export const searchDicomWebStudies = async (config: DicomWebConfig, query?: string): Promise<Study[]> => {
  // ATTEMPT 1: FULL QUERY (With extra metadata)
  // Many public servers (like DCMJS/OHIF) fail if we ask for NumberOfStudyRelatedInstances (00201208)
  try {
    const searchParams = new URLSearchParams();
    searchParams.append('limit', '50');
    searchParams.append('includefield', TAG.NUMBER_OF_SERIES);
    searchParams.append('includefield', TAG.MODALITY);
    searchParams.append('includefield', TAG.ACCESSION_NUMBER);
    searchParams.append('includefield', TAG.NUMBER_OF_STUDY_RELATED_INSTANCES);
    
    if (query) {
      searchParams.append('PatientName', `*${query}*`);
    }

    const url = getEffectiveUrl(config, `/studies?${searchParams.toString()}`);
    
    const response = await fetchWithTimeout(url, {
      mode: 'cors',
      headers: { 'Accept': 'application/dicom+json' }
    });

    if (!response.ok) {
       // Throw to trigger fallback
       throw new Error(`Full query failed ${response.status}`);
    }
    
    if (response.status === 204) return [];
    const json = await response.json();
    return parseStudies(json);

  } catch (e) {
     console.warn("Full Query Failed, Attempting Minimal Query...", e);
     
     // ATTEMPT 2: MINIMAL QUERY (Safe Mode)
     // Removes optional fields that cause 400/500 errors on strict servers
     const searchParams = new URLSearchParams();
     searchParams.append('limit', '50');
     searchParams.append('includefield', TAG.MODALITY);
     // Note: We remove Accession and Instance Counts to be safe
     
     if (query) {
       searchParams.append('PatientName', `*${query}*`);
     }

     const url = getEffectiveUrl(config, `/studies?${searchParams.toString()}`);
     const response = await fetchWithTimeout(url, {
        mode: 'cors',
        headers: { 'Accept': 'application/dicom+json' }
     });

     if (!response.ok) throw new Error(`DICOMweb Error: ${response.status}`);
     if (response.status === 204) return [];

     const json = await response.json();
     return parseStudies(json);
  }
};

const parseStudies = (json: any[]): Study[] => {
  return json.map((item: any) => ({
    id: getValue(item, TAG.STUDY_INSTANCE_UID),
    patientName: getValue(item, TAG.PATIENT_NAME, "Anonymous").replace(/\^/g, ' '),
    patientId: getValue(item, TAG.PATIENT_ID, "N/A"),
    accessionNumber: getValue(item, TAG.ACCESSION_NUMBER, ""),
    studyDate: getValue(item, TAG.STUDY_DATE),
    modality: getValue(item, TAG.MODALITY, "OT"),
    description: getValue(item, TAG.STUDY_DESC, "No Description"),
    seriesCount: parseInt(getValue(item, TAG.NUMBER_OF_SERIES, "0")),
    instanceCount: parseInt(getValue(item, TAG.NUMBER_OF_STUDY_RELATED_INSTANCES, "0"))
  }));
}

export const fetchDicomWebSeries = async (config: DicomWebConfig, studyUid: string): Promise<Series[]> => {
  const url = getEffectiveUrl(config, `/studies/${studyUid}/series`);
  const response = await fetchWithTimeout(url, {
    mode: 'cors',
    headers: { 'Accept': 'application/dicom+json' }
  });

  if (!response.ok || response.status === 204) return [];
  const json = await response.json();

  const seriesPromises = json.map(async (item: any) => {
    try {
      const seriesUid = getValue(item, TAG.SERIES_INSTANCE_UID);
      const modality = getValue(item, TAG.MODALITY);
      const description = getValue(item, TAG.SERIES_DESC) || `${modality} Series`;
      const numInstances = parseInt(getValue(item, TAG.NUMBER_OF_INSTANCES, "0"));

      // List Instances URL
      // Fix: Add limit=2000 to ensure we get the full series, not just the first 100
      const instanceListUrl = getEffectiveUrl(config, `/studies/${studyUid}/series/${seriesUid}/instances?limit=2000`);
      
      const instances = await fetchInstanceUids(config, instanceListUrl, studyUid, seriesUid);
      
      return {
        id: seriesUid,
        studyId: studyUid,
        description,
        modality,
        // Use actual length if available to avoid bounds errors, falling back to metadata count
        instanceCount: instances.length > 0 ? instances.length : numInstances,
        instances: instances
      } as Series;
    } catch (e) {
      return null;
    }
  });

  const results = await Promise.all(seriesPromises);
  return results.filter(s => s !== null && s.instanceCount > 0) as Series[];
};

// Helper to get list of Instance UIDs for a series
const fetchInstanceUids = async (config: DicomWebConfig, url: string, studyUid: string, seriesUid: string): Promise<string[]> => {
  try {
     const response = await fetchWithTimeout(url, { headers: { 'Accept': 'application/dicom+json' }});
     if (!response.ok) return [];
     const json = await response.json();
     
     // SORTING: Sort by Instance Number (00200013) to ensure correct scroll order
     json.sort((a: any, b: any) => {
       const nA = parseInt(getValue(a, TAG.INSTANCE_NUMBER, "0"));
       const nB = parseInt(getValue(b, TAG.INSTANCE_NUMBER, "0"));
       return nA - nB;
     });

     return json.map((item: any) => {
        const instanceUid = getValue(item, TAG.SOP_INSTANCE_UID);
        // We initially request the Instance Rendered URL.
        // If this fails (400 Bad Request), fetchDicomImageBlob handles the fallback to /frames/1/rendered
        const path = `/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}/rendered`;
        return getEffectiveUrl(config, path);
     });
  } catch {
    return [];
  }
}