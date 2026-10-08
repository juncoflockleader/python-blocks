import { PythonParser } from '../../../src/bridge/parser';
import { convertPython } from '../../../src/bridge/converter';
import { createWorkspace, snapshot, type Project } from '../../../src/project';

// Browser-only test entry. Production UI integration is a separate gate.
const parser = new PythonParser();
export function convert(source: string, project?: Project) {
  if (!project) {
    const workspace = createWorkspace();
    try { project = snapshot(workspace); } finally { workspace.dispose(); }
  }
  return convertPython(source, project, (text, signal) => parser.parse(text, signal));
}
export function dispose() { parser.dispose(); }
