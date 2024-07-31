import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import * as vscode from "vscode";
import { exec, spawn, ChildProcess } from "child_process";

interface SystemExecuterProps {
  outputChannel: vscode.OutputChannel;
}

class SystemExecuter {
  private static instance: SystemExecuter;
  private readonly venvPath = path.join(__dirname, "resources", "venv");
  private readonly pythonPath =
    process.platform === "win32"
      ? path.join(this.venvPath, "Scripts", "python.exe")
      : path.join(this.venvPath, "bin", "python");
  private readonly activatePath =
    process.platform === "win32"
      ? path.join(this.venvPath, "Scripts", "activate.bat")
      : path.join(this.venvPath, "bin", "activate");
  private logHandlers: ((data: any) => void)[] = [];
  private child: ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;

  private constructor({ outputChannel }: SystemExecuterProps) {
    this.outputChannel = outputChannel;
  }

  public static getInstance({
    outputChannel,
  }: {
    outputChannel: vscode.OutputChannel;
  }): SystemExecuter {
    if (!SystemExecuter.instance) {
      SystemExecuter.instance = new SystemExecuter({ outputChannel });
    }
    return SystemExecuter.instance;
  }

  public async setUpVenv() {
    const arg = !this.checkVenv() ? "false" : undefined; // assign any string is fine
    this.outputChannel.clear();
    this.outputChannel.show();
    this.outputChannel.appendLine(
      "Waiting for setting venv and Fosslight Scanner"
    );
    const progressInterval = setInterval(() => {
      this.outputChannel.append(".");
    }, 500); // print '.' every 500ms while setting

    // Will take a long time (about 3 min) when the first install the venv and fs.
    const setVenv: boolean = await this.executeSetVenv(arg);
    if (!setVenv) {
      console.error(
        "[Error]: Failed to set venv and install Fosslight Scanner.\n\t Please check the resources folder and files are in initial condition.\n\t Or try to reinstall this app."
      );
    } else {
      this.outputChannel.appendLine("Fosslight Scanner is ready to use.");
    }
    clearInterval(progressInterval); // stop printing '.'
  }

  private checkVenv(): boolean {
    return (
      fs.existsSync(this.venvPath) &&
      fs.existsSync(this.pythonPath) &&
      fs.existsSync(this.activatePath)
    );
  }

  private async executeSetVenv(arg: string | undefined): Promise<boolean> {
    const execPromise = util.promisify(exec);
    try {
      if (arg) {
        const { stderr: venvError } = await execPromise(
          `python -m venv ${this.venvPath}`
        );
        if (venvError) {
          console.error("Create venv failed: " + venvError);
          return false;
        }
      }

      const { stderr: pipError } = await execPromise(
        `${this.pythonPath} -m pip install --upgrade pip`
      );
      if (pipError) {
        console.error("pip upgrade failed: " + pipError);
        return false;
      }

      const { stderr: installError } = await execPromise(
        `${this.pythonPath} -m pip install fosslight_scanner`
      );
      if (installError) {
        console.error("Install fosslight scanner failed: " + installError);
        return false;
      }

      return true;
    } catch (error) {
      console.error(
        "An Error occurred while setting venv and fosslight_scanner: " + error
      );
      return false;
    }
  }

  public async executeScanner(args: string[][]): Promise<CommandResponse> {
    if (!this.checkVenv()) {
      console.error(
        "[Error]: Failed to run Fosslight Scanner.\n\t Please check the resources folder and files are in initial condition.\n\t Or try to reinstall this app."
      );
    }
    const mode: string = args[0].join(" ");
    const jobs: number =
      mode === "compare" ? 1 : args[1].length + args[2].length;
    const finalArgs: string[] = [];
    const result: CommandResponse = { success: false, message: "", data: [] };

    for (let i = 0; i < jobs; i++) {
      finalArgs.length = 0;

      if (mode === "compare") {
        const comparePath = "-p " + args[1].join(" ");
        finalArgs.push(mode, comparePath, ...args[3]);
      } else {
        if (args[1][0] === "undefined") {
          finalArgs.push(mode, "-p .", ...args[3]);
        } else if (i < args[1].length) {
          finalArgs.push(mode, "-p " + args[1][i], ...args[3]);
        } else {
          finalArgs.push(mode, "-w " + args[2][i - args[1].length], ...args[3]);
        }
      }

      try {
        const scannedPath: string = await this.scanProcess(finalArgs);
        result.data.push(scannedPath);
      } catch (error) {
        result.message = `${error}`;
        return result;
      }
    }

    result.success = true;
    result.message = "Fosslight Scanner finished successfully";
    return result;
  }

  public async saveSetting(setting: Setting): Promise<string> {
    return new Promise((resolve, reject) => {
      const settingPath = path.join(__dirname, "resources", "setting.json");
      fs.writeFile(settingPath, JSON.stringify(setting), (error) => {
        if (error) {
          reject(`Failed to save setting: ${error.message}`);
        } else {
          resolve("Setting file saved successfully");
        }
      });
    });
  }

  private scanProcess(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      let path: string = "";
      const shellCommand =
        process.platform === "win32"
          ? `cmd.exe /c "${this.activatePath} && fosslight ${args.join(" ")}"`
          : `bash -c "source ${this.activatePath} && fosslight ${args.join(
              " "
            )}"`;

      args.forEach((arg) => {
        if (arg.startsWith("-p")) {
          path = arg.replace("-p ", "");
        } else if (arg.startsWith("-w")) {
          path = arg.replace("-w ", "");
        }
      });

      console.log(`shellCommand: ${shellCommand}`);

      this.child = spawn(shellCommand, {
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.child.stdout?.on("data", this.handleLog);
      this.child.stderr?.on("data", this.handleLog);

      this.child.on("close", (code) => {
        this.child = null;
        code === 0
          ? resolve(path)
          : reject(
              `scan is stopped where path: ${path}, with exit code: ${code}`
            );
      });

      this.child.on("error", (error) => {
        this.child = null;
        reject(
          `scan is stopped where path: ${path}, with error: ${error.message}`
        );
      });
    });
  }

  public forceQuit() {
    if (this.child) {
      try {
        process.platform === "win32"
          ? exec(`taskkill /pid ${this.child.pid} /T /F`)
          : exec(`kill -9 ${this.child.pid}`);
      } catch (error) {
        // Handle force quit error
      }
    }
  }

  private handleLog = (data: any): void => {
    this.logHandlers.forEach((handler) => handler(data.toString()));
  };

  public onLog(handler: (data: any) => void): void {
    this.logHandlers.push(handler);
  }

  public offLog(handler: (data: any) => void): void {
    this.logHandlers = this.logHandlers.filter((h) => h !== handler);
  }
}

export default SystemExecuter;
