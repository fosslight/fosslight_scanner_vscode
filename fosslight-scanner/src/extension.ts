// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fse from "fs-extra";
import * as fs from "fs";
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

  const printOutput = async (outputDirPath: string) => {
    const outputFilePath = (
      await findFiles(outputDirPath, /fosslight_report_all_\d{6}_\d{4}\.yaml/)
    ).sort((a, b) => b.localeCompare(a))[0];
    console.log("Found the latest report file: ", outputFilePath);
    const output = fs.readFileSync(outputFilePath, "utf8");
    outputChannel.appendLine("Analysis result:\n");
    outputChannel.appendLine(output);
  };

  const findFiles = async (dir: string, regex: RegExp): Promise<string[]> => {
    let files: string[] = [];
    const entries = await fse.readdir(dir);

    for (const entry of entries) {
      const entryPath = path.join(dir, entry);
      const stat = await fse.stat(entryPath);

      if (stat.isDirectory()) {
        files = files.concat(await findFiles(entryPath, regex));
      } else if (path.basename(entry).match(regex)) {
        files.push(entryPath);
      }
    }

    return files;
  };

  const runCompareModeIfSbomExists = async (folderPath: string) => {
    const sbomFiles = await findFiles(folderPath, /sbom-info.yaml/);
    if (sbomFiles.length > 0) {
      for (const sbomFilePath of sbomFiles) {
        console.log(
          `sbom-info.yaml found at ${sbomFilePath}, running compare mode.`
        );
        outputChannel.appendLine(
          `sbom-info.yaml found at ${sbomFilePath}, running compare mode.\n`
        );

        const compareArgs = commandParser.parseCmd2Args({
          type: "compare",
          config: {
            reports: [sbomFilePath, "path/to/another/report"], // Adjust the second report path as necessary
            outputFormat: "yaml",
            outputPath: folderPath,
            outputFileName: "compare_report",
          },
        });

        await runFosslightScanner(compareArgs);
      }
    } else {
      console.log("sbom-info.yaml not found, skipping compare mode.");
      outputChannel.appendLine(
        "sbom-info.yaml not found. Skipping compare mode.\n"
      );
    }
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

      const excelArgs = commandParser.parseCmd2Args({
        type: "analyze",
        config: {
          mode: ["source", "binary", "dependency"],
          subjects: [{ type: "dir", path: rootDirPath }],
          outputFormat: "excel",
          outputPath: rootDirPath,
          outputFileName: "fosslight_report",
        },
      });

      await runFosslightScanner(excelArgs);

      const yamlArgs = commandParser.parseCmd2Args({
        type: "analyze",
        config: {
          mode: ["source", "binary", "dependency"],
          subjects: [{ type: "dir", path: rootDirPath }],
          outputFormat: "yaml",
          outputPath: rootDirPath,
          outputFileName: "fosslight_report",
        },
      });

      await runFosslightScanner(yamlArgs);

      const outputDirPath = path.join(rootDirPath, "fosslight_report");
      await printOutput(outputDirPath);
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
        if (await fse.exists(tempDirPath)) {
          throw new Error("Temporary directory './.temp' already exists.");
        }
        // Create the temporary directory
        await fse.emptyDir(tempDirPath);

        // Copy the current file to the temporary directory
        await fse.copy(filePath, tempFilePath);

        console.log("Copied file to temporary directory: ", tempFilePath);
        outputChannel.appendLine(`Analysis Subject: ${filePath}\n`);

        const args = commandParser.parseCmd2Args({
          type: "analyze",
          config: {
            mode: ["source"],
            subjects: [{ type: "dir", path: tempDirPath }],
            outputFormat: "yaml",
            outputPath: rootDirPath,
            outputFileName: "fosslight_report",
          },
        });

        await runFosslightScanner(args);

        // Remove the temporary directory
        await fse.remove(tempDirPath);
        console.log("Removed temporary directory: ", tempDirPath);

        const outputDirPath = path.join(rootDirPath, "fosslight_report");
        await printOutput(outputDirPath);
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
