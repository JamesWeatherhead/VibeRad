import { Study, Series } from "../types";

/**
 * MOCK API REMOVED.
 * This file is deprecated. The application now strictly uses DICOMweb.
 */

export const fetchStudies = async (query?: string): Promise<Study[]> => {
  return [];
};

export const fetchSeriesForStudy = async (studyId: string): Promise<Series[]> => {
  return [];
};