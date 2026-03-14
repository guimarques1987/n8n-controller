import { Workflow } from '../types';
import { Play, Pause, Trash2, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface WorkflowListProps {
  workflows: Workflow[];
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  n8nBaseUrl?: string;
}

export default function WorkflowList({ workflows, onToggle, onDelete, n8nBaseUrl }: WorkflowListProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  if (workflows.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <p className="text-gray-500">No workflows found. Create one to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              ID
            </th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {workflows.map((workflow) => (
            <tr key={workflow.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap">
                <button
                  onClick={() => onToggle(workflow.id, !workflow.active)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
                    workflow.active ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                  role="switch"
                  aria-checked={workflow.active}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      workflow.active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">{workflow.name}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {workflow.tags?.map(tag => (
                    <span key={tag.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      {tag.name}
                    </span>
                  ))}
                </div>
                {n8nBaseUrl && workflow.nodes?.filter(n => n.type === 'n8n-nodes-base.webhook').map((node, idx) => {
                  const path = node.parameters?.path || workflow.id;
                  const method = (node.parameters?.httpMethod || 'GET').toUpperCase();
                  const url = `${n8nBaseUrl}/webhook/${path}`;
                  return (
                    <div key={idx} className="mt-2 flex items-center text-xs text-gray-500 bg-gray-50 p-1 rounded border border-gray-200 group">
                      <span className="font-bold mr-1 text-xs px-1 bg-gray-200 rounded">{method}</span>
                      <span className="truncate max-w-[150px] select-all mr-2" title={url}>{url}</span>
                      <button
                        onClick={() => handleCopy(url)}
                        className="ml-auto p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 focus:outline-none"
                        title="Copy URL"
                      >
                        {copiedUrl === url ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  );
                })}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                {workflow.id}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                {n8nBaseUrl && (
                  <a
                    href={`${n8nBaseUrl}/workflow/${workflow.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-900 inline-flex items-center"
                    title="Open in n8n"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <button
                  onClick={() => onDelete(workflow.id)}
                  className="text-red-600 hover:text-red-900 inline-flex items-center"
                  title="Delete Workflow"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
