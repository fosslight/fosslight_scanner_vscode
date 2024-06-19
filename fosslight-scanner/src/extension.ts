// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import SystemExecuter from "./services/SystemExecuter";
import commandParser from "./services/CommandParser";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const systemExecuter = SystemExecuter.getInstance();
  await systemExecuter.setUpVenv();
  console.log(
    'Congratulations, your extension "fosslight-scanner-extension" is now active!'
  );

  // Command to run the scanner on the root directory of the project
  const analyzeRootDirectory = vscode.commands.registerCommand(
    "fosslight-scanner.analyzeRootDirectory",
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder open.");
        return;
      }

      const folderPath = workspaceFolders[0].uri.fsPath;
      console.log("Analysis Subject: ", folderPath);
      const args = commandParser.parseCmd2Args({
        type: "analyze",
        config: {
          mode: ["binary", "dependency"], // FIX: Change to ["source", "binary", "dependency"]
          subjects: [{ type: "dir", path: folderPath }],
          outputFormat: "excel",
          outputPath: folderPath,
          outputFileName: "fosslight_report",
        },
      });
      await systemExecuter.executeScanner(args);
    }
  );

  // Command to run the scanner on the currently opened file in the editor
  const analyzeCurrentFile = vscode.commands.registerCommand(
    "fosslight-scanner.analyzeCurrentFile",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No file open.");
        return;
      }

      const filePath = editor.document.uri.fsPath;
      console.log("Analysis Subject: ", filePath);

      // const command = `${systemExecuter.pythonPath} -m fosslight -A -p ${filePath}`;
      // await systemExecuter.executeCommand(command);
    }
  );

  context.subscriptions.push(analyzeRootDirectory, analyzeCurrentFile);
}

// This method is called when your extension is deactivated
export function deactivate() {}
