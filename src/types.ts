export interface Tag {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  type?: string; // 'personal' | 'team'
}

export interface Workflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  nodes: any[];
  connections: any;
  settings?: any;
  staticData?: any;
  tags?: Tag[];
}
