import React from 'react';

const parseInline = (text: string): React.ReactNode[] => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={index} className="font-bold text-purple-100">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={index} className="bg-black/30 px-1 rounded text-xs font-mono text-purple-300 border border-purple-500/20">{part.slice(1, -1)}</code>;
        }
        return part;
    });
};

export const MarkdownText: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null;
  
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const isBullet = trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ');
    const isHeader3 = trimmed.startsWith('### ');
    const isHeader2 = trimmed.startsWith('## ');
    const isHeader1 = trimmed.startsWith('# ');

    if (isBullet) {
        if (!inList) inList = true;
        const text = trimmed.replace(/^[*•-]\s+/, '');
        listItems.push(
            <li key={`li-${i}`} className="mb-1 pl-1 leading-relaxed text-slate-300">
                <span className="mr-2 text-purple-400">•</span>
                {parseInline(text)}
            </li>
        );
    } else {
        if (inList) {
            elements.push(<ul key={`ul-${i}`} className="mb-3 ml-2 space-y-1">{listItems}</ul>);
            listItems = [];
            inList = false;
        }
        
        if (trimmed === '') {
            elements.push(<div key={`br-${i}`} className="h-2" />);
        } else if (isHeader1 || isHeader2 || isHeader3) {
            const text = trimmed.replace(/^#+\s+/, '');
            const className = isHeader1 
                ? "text-lg font-bold text-white mt-6 mb-3 border-b border-purple-500/50 pb-2"
                : "text-sm font-bold text-white mt-4 mb-2 border-b border-purple-500/30 pb-1";
                
            elements.push(<h3 key={`h-${i}`} className={className}>{text}</h3>);
        } else {
             if (trimmed !== '') {
                 elements.push(<p key={`p-${i}`} className="mb-2 leading-relaxed text-slate-200">{parseInline(line)}</p>);
             }
        }
    }
  });

  if (inList) elements.push(<ul key={`ul-end`} className="mb-3 ml-2 space-y-1">{listItems}</ul>);
  return <div className="text-sm">{elements}</div>;
};

export const renderMarkdown = (text: string) => <MarkdownText content={text} />;
