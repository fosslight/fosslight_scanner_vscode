// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import SystemExecuter from "./services/SystemExecuter";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const systemExecuter = SystemExecuter.getInstance();
  systemExecuter.setUpVenv();
  console.log(
    'Congratulations, your extension "fosslight-scanner-extension" is now active!'
  );

  // Command to run the scanner on the root directory of the project
  const analyzeRootDirectory = vscode.commands.registerCommand(
    "extension.analyzeRootDirectory",
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder open.");
        return;
      }

      const folderPath = workspaceFolders[0].uri.fsPath;
      const command = `${systemExecuter.pythonPath} -m fosslight -A -p ${folderPath} -f yaml -o ${folderPath}/fosslight_output`;
      await systemExecuter.executeCommand(command);
    }
  );

  // Command to run the scanner on the currently opened file in the editor
  const analyzeCurrentFile = vscode.commands.registerCommand(
    "extension.analyzeCurrentFile",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No file open.");
        return;
      }

      const filePath = editor.document.uri.fsPath;
      const command = `${systemExecuter.pythonPath} -m fosslight -A -p ${filePath}`;
      await systemExecuter.executeCommand(command);
    }
  );

  context.subscriptions.push(analyzeRootDirectory, analyzeCurrentFile);
}

// This method is called when your extension is deactivated
export function deactivate() {}
