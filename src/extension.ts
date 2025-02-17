import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as CMakeTools from 'vscode-cmake-tools';
import * as fs from 'fs';

import xml2js from 'xml2js';



enum SeverityNumber {
    Info = 0,
    Warning = 1,
    Error = 2
}

function parseSeverity(str: string): vscode.DiagnosticSeverity {
    const lower = str.toLowerCase();
    if (lower.includes("error")) {
        return vscode.DiagnosticSeverity.Error;
    } else if (lower.includes("warning")) {
        return vscode.DiagnosticSeverity.Warning;
    } else {
        return vscode.DiagnosticSeverity.Information;
    }
}

function severityToNumber(sev: vscode.DiagnosticSeverity): SeverityNumber {
    switch (sev) {
        case vscode.DiagnosticSeverity.Error: return SeverityNumber.Error;
        case vscode.DiagnosticSeverity.Warning: return SeverityNumber.Warning;
        default: return SeverityNumber.Info;
    }
}

function parseMinSeverity(str: string): SeverityNumber {
    switch (str.toLowerCase()) {
        case "error": return SeverityNumber.Error;
        case "warning": return SeverityNumber.Warning;
        default: return SeverityNumber.Info;
    }
}

let my_context: vscode.ExtensionContext;
let output_channel = vscode.window.createOutputChannel("Cppcheck-lite2");


// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.
export function activate(context: vscode.ExtensionContext) {
    my_context = context;

    output_channel.appendLine("Cppcheck Lite2 is now active!");
    // Create a diagnostic collection.
    const diagnosticCollection = vscode.languages.createDiagnosticCollection("Cppcheck-Lite2");
    context.subscriptions.push(diagnosticCollection);

    async function handleDocument(document: vscode.TextDocument) {

        // Only process C/C++ files.
        if (!["c", "cpp"].includes(document.languageId)) {
            // Not a C/C++ file, skip
            return;
        }

        // Check if the file ends with .h or .hpp
        if (document.fileName.endsWith('.h') || document.fileName.endsWith('.hpp') || document.fileName.endsWith('.hxx')) {
            return;
        }

        // Check if the document is visible in any editor
        const isVisible = vscode.window.visibleTextEditors.some(editor => editor.document.uri.toString() === document.uri.toString());
        if (!isVisible) {
            // Document is not visible, skip
            return;
        }

        output_channel.appendLine("Cppcheck Lite2: Running cppcheck on " + document.fileName);
        let item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        item.text = "Cppchecking " + path.basename(document.fileName);
        item.show();

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath || "";

        const config = vscode.workspace.getConfiguration();
        const isEnabled = config.get<boolean>("cppcheck-lite2.enable", true);
        const minSevString = config.get<string>("cppcheck-lite2.minSeverity", "info");
        const userPath = config.get<string>("cppcheck-lite2.path")?.trim() || "";
        const buildDirectory = path.normalize(workspaceFolder + path.sep + (config.get<string>("cppcheck-lite2.buildDirectory")?.trim() || "cppcheck-lite2-build"));
        const commandPath = userPath ? userPath : "cppcheck";
        let compileCommandsPath = config.get<string>("cppcheck-lite2.compileCommandsPath")?.trim() || "";

        compileCommandsPath = path.normalize(compileCommandsPath ? workspaceFolder + path.sep + compileCommandsPath : (workspaceFolder + path.sep + "compile_commands.json"));

        // If disabled, clear any existing diagnostics for this doc.
        if (!isEnabled) {
            diagnosticCollection.delete(document.uri);
            return;
        }

        // Check if cppcheck is available
        cp.exec(`"${commandPath}" --version`, (error) => {
            if (error) {
                vscode.window.showErrorMessage(
                    `Cppcheck Lite2: Could not find or run '${commandPath}'. ` +
                    `Please install cppcheck or set 'cppcheck-lite.path' correctly.`
                );
                return;
            }
        });

        await runCppcheck(
            document,
            commandPath,
            minSevString,
            diagnosticCollection,
            buildDirectory,
            compileCommandsPath,
            item
        );
    }

    // Listen for file saves.
    vscode.workspace.onDidSaveTextDocument(handleDocument, null, context.subscriptions);

    // Run cppcheck when a file is opened
    vscode.workspace.onDidOpenTextDocument(handleDocument, null, context.subscriptions);

    // Run cppcheck for all open files when the workspace is opened
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
        vscode.workspace.textDocuments.forEach(handleDocument);
    }, null, context.subscriptions);

    // Run cppcheck for all open files at activation (for already opened workspaces)
    vscode.workspace.textDocuments.forEach(handleDocument);

    // Clean up diagnostics when a file is closed
    vscode.workspace.onDidCloseTextDocument((document: vscode.TextDocument) => {
        diagnosticCollection.delete(document.uri);
    }, null, context.subscriptions);
}

function findCppcheckConfig(filePath: string): string | null {
    // Get the directory of the file being checked
    let currentDir = path.dirname(path.resolve(filePath));

    while (true) {
        const configPath = path.join(currentDir, '.cppcheck-config');
        if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
            return configPath;
        }
        // Move up to the parent directory
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {  // Reached the root directory
            return null;
        }
        currentDir = parentDir;
    }
}

function readCppcheckConfig(configPath: string): string[] {
    // Read the file content
    const fileContent = fs.readFileSync(configPath, 'utf-8');

    // Split the content into lines, trim whitespace, filter out empty lines and comments
    return fileContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
}

function parseCppcheckOutput(output: string, minSevNum: SeverityNumber, diagnosticCollection: vscode.DiagnosticCollection): void {
    output_channel.appendLine("Cppcheck Lite2: Parsing \n\r" + output);

    const parser = new xml2js.Parser({ explicitArray: false });

    parser.parseString(output, (err, result) => {
        if (err) {
            output_channel.appendLine("Cppcheck Lite2: Error parsing xml: " + err);
            return;
        }
        else {
            output_channel.appendLine("Cppcheck Lite2: Successfully parsed xml");
            let diagnosticsPerFile = new Map<string, vscode.Diagnostic[]>();

            const errors = result.results.errors.error;

            errors.forEach((error: any, index: number) => {
                // output_channel.appendLine(`\nError #${index + 1}:`);
                // output_channel.appendLine('ID:' + error.$.id);
                // output_channel.appendLine('Severity:' + error.$.severity);
                // output_channel.appendLine('Message:' + error.$.msg);
                // output_channel.appendLine('Verbose:' + error.$.verbose);
                // output_channel.appendLine('CWE:' + error.$.cwe);
                // output_channel.appendLine('File:' + error.$.file0);

                const location = error.location;
                // output_channel.appendLine('Location:');
                // output_channel.appendLine('  File:' + location.$.file);
                // output_channel.appendLine('  Line:' + location.$.line);
                // output_channel.appendLine('  Column:' + location.$.column);
                // output_channel.appendLine('  Info:' + location.$.info);

                const diagSeverity = parseSeverity(error.$.severity);

                // Filter out if severity is less than our minimum
                if (severityToNumber(diagSeverity) >= minSevNum) {
                    let line = parseInt(location.$.line) - 1;
                    if (line < 0) {
                        line = 0;
                    }
                    let col = parseInt(location.$.column) - 1;
                    if (col < 0) {
                        col = 0;
                    }

                    const range = new vscode.Range(line, col, line, col);
                    const diagnostic = new vscode.Diagnostic(range, error.$.msg, diagSeverity);
                    diagnostic.code = error.$.cwe;
                    diagnostic.source = error.$.id; //If we don't do this, the codes are empty for some reason. 

                    if (!diagnosticsPerFile.has(location.$.file)) {
                        diagnosticsPerFile.set(location.$.file, [diagnostic]);
                    }
                    else {
                        diagnosticsPerFile.get(location.$.file)?.push(diagnostic);
                    }
                }

            });

            diagnosticsPerFile.forEach((value, key) => {
                const fileUri = vscode.Uri.file(key);
                diagnosticCollection.set(fileUri, value);
            });
        }
    });
}

async function runCppcheck(
    fileToCheck: vscode.TextDocument,
    cppcheckExePath: string,
    minSevString: string,
    diagnosticCollection: vscode.DiagnosticCollection,
    buildDirectory: string,
    compileCommandsPath: string,
    statusBarItem: vscode.StatusBarItem
): Promise<void> {
    // Clear existing diagnostics
    diagnosticCollection.clear();

    //Indicate vs code that Cppcheck is running: 

    const capitalizeFirstLetter = (text: string): string => {
        return text.replace(/(^[a-z])(?=:)/g, (match) => match.toUpperCase());
    };
    const filePath = capitalizeFirstLetter(fileToCheck.fileName);

    let cppcheckConfigPath = findCppcheckConfig(filePath);
    if (!cppcheckConfigPath) {
        output_channel.appendLine("Cppcheck Lite2: Did not find .cppcheck-config file");
        vscode.window.showErrorMessage(`Cppcheck Lite: No .cppcheck-config file found. Please create one and place it just like you would a .clang-tidy or .clang-format file. `);
        return;
    }

    output_channel.appendLine("Cppcheck Lite2: Found .cppcheck-config.");
    let cppcheck_config_params = readCppcheckConfig(cppcheckConfigPath);

    let cppcheckParameterTemplate = '--xml';
    let cppcheckParameterFileFilter = `--file-filter="${filePath}"`;
    let cppcheckParameterProject = `--project="${compileCommandsPath}"`;

    let cppcheckCommand = `"${cppcheckExePath}" ${cppcheck_config_params.join(' ')} ${cppcheckParameterFileFilter} ${cppcheckParameterTemplate} ${cppcheckParameterProject}`;
    cppcheckCommand = cppcheckCommand.replace(/\\/g, '/');

    const minSevNum = parseMinSeverity(minSevString);
    output_channel.appendLine("Cppcheck Lite2: Running command: " + cppcheckCommand);

    cp.exec(cppcheckCommand, async (error, stdout, stderr) => {
        if (error) {
            output_channel.appendLine("Cppcheck Lite2: error running cppcheck: " + error.message);
            output_channel.appendLine("Cppcheck Lite2: stdout:" + stdout);
            output_channel.appendLine("Cppcheck Lite2: stderr:" + stderr);

            vscode.window.showErrorMessage(`Cppcheck Lite2: ${error.message}`);
            return;
        }
        else{
            output_channel.appendLine("Cppcheck Lite2: Finished running cppcheck. Parsing output now. ");

            parseCppcheckOutput(stderr, minSevNum, diagnosticCollection);
        }
        statusBarItem.dispose();
    });
}

// This method is called when your extension is deactivated
export function deactivate() { }
