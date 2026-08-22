export interface LinkNode {
  id: string;

  originalTarget: string;

  fragment: string | null;

  resolvedTarget: null | string;

  label: string;
}
