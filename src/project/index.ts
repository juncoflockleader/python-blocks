import { loadWorkspace } from '../language/serialization';
import { Blockly } from '../blocks';
import { LANGUAGE_VERSION } from '../language/compiler';
import { migrateFunctions } from './migrate-functions';
import { installPythonVariables } from '../language/variables';
import { moduleState, utf8Size } from '../language/modules';
import { validateModuleDefinitions } from '../language/module-format';
import { validateLambdaIdentities } from '../language/lambdas';
import '../bridge/draft-state';

export const STORAGE_KEY = 'python-blocks.project.v1';
export const MAX_FILE_SIZE = 16_000_000;
export interface Project {
  format: 'python-blocks';
  formatVersion: 1 | 2;
  languageVersion: number;
  workspace: ReturnType<typeof Blockly.serialization.workspaces.save>;
}
export interface PreparedProject { project: Project; migrationStacks: { id: string; label: string }[] }
export function createWorkspace() { const workspace = new Blockly.Workspace(new Blockly.Options({ oneBasedIndex: false })); installPythonVariables(workspace); return workspace; }
export function snapshot(workspace: Blockly.Workspace): Project {
  return { format: 'python-blocks', formatVersion: 2, languageVersion: LANGUAGE_VERSION, workspace: Blockly.serialization.workspaces.save(workspace) };
}

function checkWorkspace(data: unknown): asserts data is Project['workspace'] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The project workspace is invalid.');
  const obj = data as Record<string, unknown>;
  if (obj.blocks !== undefined && (!obj.blocks || typeof obj.blocks !== 'object' || !Array.isArray((obj.blocks as Record<string, unknown>).blocks))) throw new Error('The project block list is invalid.');
}

export function prepareProject(text: string): PreparedProject {
  if (utf8Size(text) > MAX_FILE_SIZE) throw new Error('This project is too large to load (16 MB limit).');
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Choose a Python Blocks project JSON file.');
  const value = data as Record<string, unknown>;
  const legacy = value.format === undefined && value.blocks !== undefined;
  if (!legacy && (value.format !== 'python-blocks' || ![1, 2].includes(value.formatVersion as number) || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, LANGUAGE_VERSION].includes(value.languageVersion as number))) throw new Error('This project uses an unsupported format or language version. The original file has been preserved.');
  const state = legacy ? data : value.workspace;
  checkWorkspace(state);
  const candidate = createWorkspace();
  try {
    loadWorkspace(state, candidate);
    validateLambdaIdentities(candidate);
    validateModuleDefinitions(moduleState(candidate));
    if (candidate.getAllBlocks(false).length > 2000) throw new Error('This project has more than 2,000 blocks.');
    if (legacy || value.languageVersion === 1) loadWorkspace(migrateFunctions(candidate), candidate);
    let migrationStacks: PreparedProject['migrationStacks'] = [];
    if (legacy && !candidate.getTopBlocks(false).some(b => b.type === 'py_program')) {
      const stacks = candidate.getTopBlocks(true).filter(b => b.previousConnection && !b.outputConnection);
      if (stacks.length === 1) wrapStacks(candidate, stacks.map(b => b.id));
      else migrationStacks = stacks.map(b => ({ id: b.id, label: b.toString(70) }));
    }
    return { project: snapshot(candidate), migrationStacks };
  } finally { candidate.dispose(); }
}

function wrapStacks(workspace: Blockly.Workspace, ids: string[]) {
  const root = workspace.newBlock('py_program');
  let connection = root.getInput('BODY')!.connection!;
  for (const id of ids) {
    const block = workspace.getBlockById(id);
    if (!block?.previousConnection || block.getParent()) throw new Error('The migration stack is no longer available.');
    connection.connect(block.previousConnection);
    let tail = block;
    while (tail.getNextBlock()) tail = tail.getNextBlock()!;
    if (!tail.nextConnection && id !== ids.at(-1)) throw new Error('A terminating block must be the last stack.');
    connection = tail.nextConnection!;
  }
}

export function confirmMigration(prepared: PreparedProject, orderedIds: string[]): Project {
  if (orderedIds.length !== prepared.migrationStacks.length || new Set(orderedIds).size !== orderedIds.length || prepared.migrationStacks.some(s => !orderedIds.includes(s.id))) throw new Error('Choose each startup stack exactly once.');
  const candidate = createWorkspace();
  try {
    loadWorkspace(prepared.project.workspace, candidate);
    wrapStacks(candidate, orderedIds);
    return snapshot(candidate);
  } finally { candidate.dispose(); }
}

export function restore(workspace: Blockly.Workspace, project: Project) {
  // Validate in a separate workspace before touching the learner's work.
  const prepared = prepareProject(JSON.stringify(project));
  const before = Blockly.serialization.workspaces.save(workspace);
  Blockly.Events.disable();
  try {
    try { loadWorkspace(prepared.project.workspace, workspace); }
    catch (error) { loadWorkspace(before, workspace); throw error; }
    workspace.clearUndo();
  } finally { Blockly.Events.enable(); }
}
