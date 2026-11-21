import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

if (process.platform !== 'darwin') throw new Error('The keyboard shortcut installer requires macOS.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw new Error('--output needs a workflow path.');
const destination = outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : join(homedir(), 'Library/Services/New site post.workflow');
const bundle = 'dev.tatendanyemudzo.post-composer';

// Python's standard plist library keeps paths, quotes and XML characters out of shell syntax.
execFileSync('/usr/bin/python3', ['-', root, destination, process.execPath, bundle], { input: `
import pathlib, plistlib, shlex, sys, uuid
root, destination, node, bundle = sys.argv[1:]
target = pathlib.Path(destination)
info = target / 'Contents/Info.plist'
if target.exists():
    if not info.exists() or plistlib.loads(info.read_bytes()).get('CFBundleIdentifier') != bundle:
        raise SystemExit('A different workflow already uses this name. It was not changed.')
resources = target / 'Contents/Resources'
resources.mkdir(parents=True, exist_ok=True)
command = 'exec ' + shlex.quote(node) + ' ' + shlex.quote(str(pathlib.Path(root) / 'tools/composer/launch.mjs'))
service = {'NSMenuItem': {'default': 'New site post'}, 'NSMessage': 'runWorkflowAsService', 'NSRequiredContext': {}, 'NSSendTypes': [], 'NSReturnTypes': []}
info.write_bytes(plistlib.dumps({'CFBundleIdentifier': bundle, 'CFBundleName': 'New site post', 'CFBundleVersion': '1.0', 'NSServices': [service]}))
action = {'ActionBundlePath': '/System/Library/Automator/Run Shell Script.action', 'ActionName': 'Run Shell Script', 'ActionParameters': {'COMMAND_STRING': command, 'source': command, 'inputMethod': 0, 'shell': '/bin/zsh', 'CheckedForUserDefaultShell': True}, 'AMAccepts': {'Container': 'List', 'Optional': True, 'Types': ['com.apple.cocoa.string']}, 'AMProvides': {'Container': 'List', 'Types': ['com.apple.cocoa.string']}, 'AMActionVersion': '2.0.3', 'AMParameterProperties': {}, 'BundleIdentifier': 'com.apple.RunShellScript', 'Class Name': 'RunShellScriptAction', 'UUID': str(uuid.uuid4()), 'InputUUID': str(uuid.uuid4()), 'OutputUUID': str(uuid.uuid4()), 'isViewVisible': True}
workflow = {'AMApplicationBuild': '523', 'AMApplicationVersion': '2.10', 'AMDocumentVersion': '2', 'actions': [{'action': action, 'isViewVisible': True}], 'connectors': {}, 'workflowMetaData': {'serviceApplicationBundleID': '', 'serviceInputTypeIdentifier': 'com.apple.Automator.nothing', 'serviceOutputTypeIdentifier': 'com.apple.Automator.nothing', 'serviceProcessesInput': 0, 'workflowTypeIdentifier': 'com.apple.Automator.servicesMenu'}}
(resources / 'document.wflow').write_bytes(plistlib.dumps(workflow))
`, stdio: ['pipe', 'pipe', 'pipe'] });

if (outputIndex < 0) {
  // Update this service only; preserve every other service and custom shortcut.
  const key = `${bundle} - New site post - runWorkflowAsService`;
  execFileSync('/usr/bin/defaults', ['write', 'pbs', 'NSServicesStatus', '-dict-add', key, '{ enabled_services_menu = 1; enabled_context_menu = 1; key_equivalent = "^~@p"; presentation_modes = { ServicesMenu = 1; ContextMenu = 1; }; }']);
  execFileSync('/System/Library/CoreServices/pbs', ['-flush']);
  execFileSync('/System/Library/CoreServices/pbs', ['-update']);
  console.log('Installed “New site post”. Shortcut: Control + Option + Command + P.');
  console.log('If macOS has not refreshed it, enable New site post in System Settings > Keyboard > Keyboard Shortcuts > Services.');
} else console.log(`Generated workflow at ${destination}`);
