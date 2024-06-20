// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs-extra";
import path from "path";
import SystemExecuter from "./services/SystemExecuter";
import commandParser from "./services/CommandParser";
import { removeAnsiEscapeCodes } from "./utils/parseLog";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
let outputChannel = vscode.window.createOutputChannel("Fosslight Scanner");

export async function activate(context: vscode.ExtensionContext) {
  const systemExecuter = SystemExecuter.getInstance();
  await systemExecuter.setUpVenv();
  console.log(
    'Congratulations, your extension "fosslight-scanner-extension" is now active!'
  );

  const runFosslightScanner = async (args: string[][]): Promise<void> => {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Running Fosslight Scanner...",
        cancellable: false,
      },
      async (progress) => {
        vscode.window.showInformationMessage("Analysis started.");
        const handleLog = (log: string) => {
          outputChannel.appendLine(removeAnsiEscapeCodes(log));
        };

        systemExecuter.onLog(handleLog);
        await systemExecuter.executeScanner(args);
        systemExecuter.offLog(handleLog);

        vscode.window.showInformationMessage("Analysis completed.");
      }
    );
  };

  // Command to run the scanner on the root directory of the project
  const analyzeRootDirectory = vscode.commands.registerCommand(
    "fosslight-scanner.analyzeRootDirectory",
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder open.");
        return;
      }

      outputChannel.clear();
      outputChannel.show();

      const rootDirPath = workspaceFolders[0].uri.fsPath;
      outputChannel.appendLine(`Analysis Subject: ${rootDirPath}\n`);

      const args = commandParser.parseCmd2Args({
        type: "analyze",
        config: {
          mode: ["source", "binary", "dependency"],
          subjects: [{ type: "dir", path: rootDirPath }],
          outputFormat: "yaml",
          outputPath: rootDirPath,
          outputFileName: "fosslight_report",
        },
      });

      await runFosslightScanner(args);
    }
  );

  // Command to run the scanner on the currently opened file in the editor
  const analyzeCurrentFile = vscode.commands.registerCommand(
    "fosslight-scanner.analyzeCurrentFile",
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder open.");
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No file open.");
        return;
      }

      outputChannel.clear();
      outputChannel.show();

      const rootDirPath = workspaceFolders[0].uri.fsPath;
      const filePath = editor.document.uri.fsPath;
      const tempDirPath = path.join(rootDirPath, ".temp");
      const tempFilePath = path.join(tempDirPath, path.basename(filePath));

      try {
        if (await fs.exists(tempDirPath)) {
          throw new Error("Temporary directory './.temp' already exists.");
        }
        // Create the temporary directory
        await fs.emptyDir(tempDirPath);

        // Copy the current file to the temporary directory
        await fs.copy(filePath, tempFilePath);

        console.log("Copied file to temporary directory: ", tempFilePath);
        outputChannel.appendLine(`Analysis Subject: ${filePath}\n`);

        const args = commandParser.parseCmd2Args({
          type: "analyze",
          config: {
            mode: ["source"],
            subjects: [{ type: "dir", path: tempDirPath }],
            outputFormat: "excel",
            outputPath: rootDirPath,
            outputFileName: "fosslight_report",
          },
        });

        await runFosslightScanner(args);

        // Remove the temporary directory
        await fs.remove(tempDirPath);
        console.log("Removed temporary directory: ", tempDirPath);
      } catch (error) {
        vscode.window.showErrorMessage("Error during analysis: " + error);
      }
    }
  );

  context.subscriptions.push(analyzeRootDirectory, analyzeCurrentFile);
}

// This method is called when your extension is deactivated
export function deactivate() {
  outputChannel.dispose();
}
