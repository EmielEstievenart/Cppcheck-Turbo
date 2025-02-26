import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as CMakeTools from 'vscode-cmake-tools';
import * as fs from 'fs';
const util = require('util');

import xml2js from 'xml2js';
import { Console } from 'console';


enum SeverityNumber {
    Info = 0,
    Warning = 1,
    Error = 2
}

function parseSeverity(str: string): vscode.DiagnosticSeverity {
    const lower = str.toLowerCase();
    if (lower.includes("error")) {
        return vscode.DiagnosticSeverity.Error;
    } else if (lower.includes("warning") || lower.includes("portability") || lower.includes("performance")) {
        return vscode.DiagnosticSeverity.Warning;
    }
    else if (lower.includes("style")) {
        return vscode.DiagnosticSeverity.Information;
    }
    else {
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
let output_channel = vscode.window.createOutputChannel("Cppcheck-Turbo");

let i = 0;

// This method is called when your extension is activated.
// Your extension is activated the very first time the command is executed.
export function activate(context: vscode.ExtensionContext) {
    my_context = context;

    output_channel.appendLine("Cppcheck-Turbo is now active!");
    // Create a diagnostic collection.
    const diagnosticCollection = vscode.languages.createDiagnosticCollection("Cppcheck-Turbo");
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

        output_channel.appendLine("Cppcheck-Turbo: Running cppcheck on " + document.fileName);
        let item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        item.text = "Cppchecking " + path.basename(document.fileName);
        item.show();

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath || "";

        const config = vscode.workspace.getConfiguration();
        const isEnabled = config.get<boolean>("cppcheck-turbo.enable", true);
        const minSevString = config.get<string>("cppcheck-turbo.minSeverity", "info");
        const userPath = config.get<string>("cppcheck-turbo.path")?.trim() || "";
        const buildDirectory = path.normalize(workspaceFolder + path.sep + (config.get<string>("cppcheck-turbo.buildDirectory")?.trim() || "cppcheck-turbo-build"));
        const commandPath = userPath ? userPath : "cppcheck";
        let compileCommandsPath = config.get<string>("cppcheck-turbo.compileCommandsPath")?.trim() || "";
        const useCompileCommands = config.get<boolean>("cppcheck-turbo.useCompileCommands", false);

        compileCommandsPath = path.normalize(compileCommandsPath ? workspaceFolder + path.sep + compileCommandsPath : (workspaceFolder + path.sep + "compile_commands.json"));

        // If disabled, clear any existing diagnostics for this doc.
        if (!isEnabled) {
            diagnosticCollection.delete(document.uri);
            return;
        }



        const cppcheckPromise = runCppcheck(
            document,
            commandPath,
            minSevString,
            diagnosticCollection,
            buildDirectory,
            compileCommandsPath,
            useCompileCommands,
        );

        cppcheckPromise
            .then(() => {
                item.text = "Done checking " + path.basename(document.fileName);
                setTimeout(() => {
                    item.dispose();
                }, 1000);
            })
            .catch((err) => {
                item.text = "Error checking " + path.basename(document.fileName);
                setTimeout(() => {
                    item.dispose();
                }, 2000);
                output_channel.appendLine("Cppcheck-Turbo: " + err);
                // vscode.window.showErrorMessage(`Cppcheck-Turbo: ${err}`);
            })
            .finally(() => {

            });

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
    output_channel.appendLine("Cppcheck-Turbo: Parsing \n\r" + output);

    const parser = new xml2js.Parser({ explicitArray: false });

    parser.parseString(output, (err, result) => {
        if (err) {
            output_channel.appendLine("Cppcheck-Turbo: Error parsing xml: " + err);
            return;
        }
        else {
            output_channel.appendLine("Cppcheck-Turbo: Successfully parsed xml");
            let diagnosticsPerFile = new Map<string, vscode.Diagnostic[]>();


            const errors = Array.isArray(result.results.errors.error)
                ? result.results.errors.error // Multiple errors (already an array)
                : [result.results.errors.error]; // Single error (wrap in an array)

            errors.forEach((error: any, index: number) => {
                // output_channel.appendLine(`\nError #${index + 1}:`);
                // output_channel.appendLine('ID:' + error.$.id);
                // output_channel.appendLine('Severity:' + error.$.severity);
                // output_channel.appendLine('Message:' + error.$.msg);
                // output_channel.appendLine('Verbose:' + error.$.verbose);
                // output_channel.appendLine('CWE:' + error.$.cwe);
                // output_channel.appendLine('File:' + error.$.file0);

                if (error.location) {
                    const locations = Array.isArray(error.location)
                        ? error.location // Multiple locations (already an array)
                        : [error.location]; // Single location (wrap in an array)

                    locations.forEach((location: any, index: number) => {
                        const diagSeverity = parseSeverity(error.$.severity);

                        if (location) {
                            // Filter out if severity is less than our minimum
                            // if (severityToNumber(diagSeverity) >= minSevNum) {
                            let line = 0;
                            let col = 0;

                            try {
                                line = parseInt(location.$.line) - 1;
                                if (line < 0) {
                                    line = 0;
                                }
                                col = parseInt(location.$.column) - 1;
                                if (col < 0) {
                                    col = 0;
                                }
                            }
                            catch (e) {
                                output_channel.appendLine("Cppcheck-Turbo: was parsing " + e);
                            }


                            const range = new vscode.Range(line, col, line, col);
                            const diagnostic = new vscode.Diagnostic(range, error.$.msg, diagSeverity);
                            diagnostic.code = error.$.cwe ? error.$.cwe : " ";
                            diagnostic.source = error.$.id; //If we don't do this, the codes are empty for some reason. 

                            if (!diagnosticsPerFile.has(location.$.file)) {
                                diagnosticsPerFile.set(location.$.file, [diagnostic]);
                            }
                            else {
                                diagnosticsPerFile.get(location.$.file)?.push(diagnostic);
                            }
                            // }
                        }
                    });
                }
                else {
                    console.log("");

                }


                // const location = error.location;
                // output_channel.appendLine('Location:');
                // output_channel.appendLine('  File:' + location.$.file);
                // output_channel.appendLine('  Line:' + location.$.line);
                // output_channel.appendLine('  Column:' + location.$.column);
                // output_channel.appendLine('  Info:' + location.$.info);




            });

            diagnosticsPerFile.forEach((value, key) => {
                const fileUri = vscode.Uri.file(key);
                diagnosticCollection.set(fileUri, value);
            });
        }
    });
}

const exec = util.promisify(cp.exec);


async function runCppcheck(
    fileToCheck: vscode.TextDocument,
    cppcheckExePath: string,
    minSevString: string,
    diagnosticCollection: vscode.DiagnosticCollection,
    buildDirectory: string,
    compileCommandsPath: string,
    useCompileCommands: boolean,
): Promise<void> {

    try
    {
        await exec(`"${cppcheckExePath}" --version`);
    }
    catch (error)
    {
        throw error;
    }

    let startTime = Date.now();

    diagnosticCollection.clear();

    const capitalizeFirstLetter = (text: string): string => {
        return text.replace(/(^[a-z])(?=:)/g, (match) => match.toUpperCase());
    };
    const filePath = capitalizeFirstLetter(fileToCheck.fileName);

    let cppcheckConfigPath = findCppcheckConfig(filePath);
    if (!cppcheckConfigPath) {
        output_channel.appendLine("Cppcheck-Turbo: Did not find .cppcheck-config file");
        vscode.window.showErrorMessage(`Cppcheck-Turbo: No .cppcheck-config file found. Please create one and place it just like you would a .clang-tidy or .clang-format file. `);
        return;
    }

    output_channel.appendLine("Cppcheck-Turbo: Found .cppcheck-config.");
    let cppcheck_config_params = readCppcheckConfig(cppcheckConfigPath);

    let cppcheckParameterTemplate = '--xml';
    let cppcheckParameterFileFilter = `--file-filter="${filePath}"`;
    let cppcheckParameterProject = `--project="${compileCommandsPath}"`;
    if (!useCompileCommands) {
        // Clear this as we expect the user to configure the rest via the .cppcheck-config file
        cppcheckParameterProject = "";
    }
    let cppcheckXmlFile = "cppcheck_errors" + i.toString() + ".xml";
    i++;

    let cppcheckCommand = `"${cppcheckExePath}" ${cppcheck_config_params.join(' ')} ${cppcheckParameterFileFilter} ${cppcheckParameterTemplate} ${cppcheckParameterProject} 2> ${cppcheckXmlFile}`;
    cppcheckCommand = cppcheckCommand.replace(/\\/g, '/');

    const minSevNum = parseMinSeverity(minSevString);

    let endTime = Date.now();
    output_channel.appendLine(`Cppcheck-Turbo: Time taken to gather parameters: ${endTime - startTime}ms`);

    output_channel.appendLine("Cppcheck-Turbo: Running command: " + cppcheckCommand);
    startTime = Date.now();
    const p = cp.exec(cppcheckCommand, async (error, stdout, stderr) => {
        if (error) {
            output_channel.appendLine("Cppcheck-Turbo: error running cppcheck: " + error.message);
            output_channel.appendLine("Cppcheck-Turbo: stdout:" + stdout);
            output_channel.appendLine("Cppcheck-Turbo: stderr:" + stderr);

            vscode.window.showErrorMessage(`Cppcheck-Turbo: ${error.message}`);
            fs.unlink(cppcheckXmlFile, (err) => {
                if (err) {
                    console.error('Error deleting the file:', err);
                    return;
                }
                console.log('File deleted successfully');
            });

            return;
        }
        else {

            endTime = Date.now();
            output_channel.appendLine("Cppcheck-Turbo: Finished running cppcheck. Parsing output now. ");
            output_channel.appendLine(`Cppcheck-Turbo: Time taken to run cppcheck: ${endTime - startTime}ms`);

            fs.readFile(cppcheckXmlFile, 'utf8', (err, data) => {
                if (err) {
                    console.error('Error reading the file:', err);
                    fs.unlink(cppcheckXmlFile, (err) => {
                        if (err) {
                            console.error('Error deleting the file:', err);
                            return;
                        }
                        console.log('File deleted successfully');
                    });
                    return;
                }

                // Store the file content in a string
                //const fileContent: string = data;
                //console.log('File content:', fileContent);

                startTime = Date.now();
                parseCppcheckOutput(data, minSevNum, diagnosticCollection);
                endTime = Date.now();
                output_channel.appendLine(`Cppcheck-Turbo: Time taken to parse output: ${endTime - startTime}ms`);
                fs.unlink(cppcheckXmlFile, (err) => {
                    if (err) {
                        console.error('Error deleting the file:', err);
                        return;
                    }
                    console.log('File deleted successfully');
                });
            });
        }
    });
}

// This method is called when your extension is deactivated
export function deactivate() { }
