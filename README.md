# fosslight_vscode_extension

FOSSLight Scanner for VS Code extension

## Project Setup

### Prerequisites

- [Python 3.8+](https://www.python.org/downloads/)
- [Java (for JAR analysis)](https://www.oracle.com/java/technologies/downloads/)
- [Microsoft Build Tools (for Windows)](https://visualstudio.microsoft.com/ko/visual-cpp-build-tools/)

### Install

```bash
$ yarn
```

### Development

#### Compile

```bash
$ yarn compile
```

> Must be executed before running the extension.

#### Run

> Open **src/extension.ts** and press `F5` or run the command Debug: Start Debugging from the Command Palette (`Ctrl+Shift+P`).

### Releasing New Version in VSCode Extention Marketplace

1. Change version number at package.json file
2. Change README.md file of fosslight-scanner directory if needed.
3. Type the below commands in order to the terminal.

```bash
$ npm install -g vsce (only if needed)
```

```bash
$ vsce login lgopensource
```

4. Type the Azure personal access token in the terminal as instructed.
5. Type `vsce publish` and type `y` in for the two 'Do you want to continue?' questions.
