import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
// import * as CMakeTools from 'vscode-cmake-tools';
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

let xmlFileIndex = 0;

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

        output_channel.appendLine("Running cppcheck on " + document.fileName);
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

        runCppcheckChain(document, commandPath, minSevString, diagnosticCollection, buildDirectory, compileCommandsPath, useCompileCommands, item);
    }

    // Listen for file saves.
    vscode.workspace.onDidSaveTextDocument(handleDocument, null, context.subscriptions);

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
    output_channel.appendLine("Parsing \n\r" + output);

    const parser = new xml2js.Parser({ explicitArray: false });

    parser.parseString(output, (err, result) => {
        if (err) {
            output_channel.appendLine("Error parsing xml: " + err);
            return;
        }
        else {
            output_channel.appendLine("Successfully parsed xml");
            let diagnosticsPerFile = new Map<string, vscode.Diagnostic[]>();


            const errors = Array.isArray(result.results.errors.error)
                ? result.results.errors.error // Multiple errors (already an array)
                : [result.results.errors.error]; // Single error (wrap in an array)

            errors.forEach((error: any, index: number) => {
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
                                output_channel.appendLine("Was parsing " + e);
                            }


                            const range = new vscode.Range(line, col, line, col);
                            const diagnostic = new vscode.Diagnostic(range, error.$.msg, diagSeverity);
                            diagnostic.code = error.$.id ? error.$.id : " ";
                            diagnostic.source = "Cppcheck-Turbo";

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
            });

            diagnosticsPerFile.forEach((value, key) => {
                const fileUri = vscode.Uri.file(key);
                diagnosticCollection.set(fileUri, value);
            });
        }
    });
}

function runCppcheckChain(
    fileToCheck: vscode.TextDocument,
    cppcheckExePath: string,
    minSevString: string,
    diagnosticCollection: vscode.DiagnosticCollection,
    buildDirectory: string,
    compileCommandsPath: string,
    useCompileCommands: boolean,
    statusBarItem: vscode.StatusBarItem
) {
    let startTime = Date.now();
    const p = cp.exec(`"${cppcheckExePath}" --version`, async (error, stdout, stderr) => {
        if (error) {
            output_channel.appendLine("Error checking version: " + error.message);
            output_channel.appendLine("stdout: " + stdout);
            output_channel.appendLine("stderr: " + stderr);
            vscode.window.showErrorMessage(`Cppcheck-Turbo: ${error.message}`);
            statusBarItem.text = "Error checking " + path.basename(fileToCheck.fileName);
            setTimeout(() => {
                statusBarItem.dispose();
            }, 2000);
            return;
        }
        else {
            runCppcheck(fileToCheck, cppcheckExePath, minSevString, diagnosticCollection, buildDirectory, compileCommandsPath, useCompileCommands, startTime, statusBarItem);
        }
    });
}

function getParametersFromCompileCommands(compileCommandsPath: string, analyzedFile: string): string[] {
    let parameters: string[] = [];

    let command = getCompileCommand(compileCommandsPath, analyzedFile);
    if (command) {
        getDefinesFromCompileCommand(command).forEach((define) => {
            parameters.push(define);
        });
        getIncludePathsFromCompileCommand(command).forEach((includePath) => {
            parameters.push(includePath);
        });
    }

    return parameters;
}

function getCompileCommand(compileCommandsPath: string, analyzedFile: string): string {
    let compileCommand = "";
    let normalizedAnalyzedFile = path.normalize(analyzedFile).toLowerCase();
    // Read the compile_commands.json file and find the command for the analyzed file
    try {
        const compileCommands = JSON.parse(fs.readFileSync(compileCommandsPath, 'utf-8'));
        const entry = compileCommands.find((entry: any) => path.normalize(entry.file).toLowerCase() === normalizedAnalyzedFile);
        if (entry && entry.command) {
            compileCommand = entry.command;
        } else {
            output_channel.appendLine(`No compile command found for file: ${analyzedFile}`);
        }
    } catch (error) {
        output_channel.appendLine(`Error reading compile_commands.json: ${error}`);
    }
    return compileCommand;
}

function getDefinesFromCompileCommand(compileCommand: string): string[] {

    let defines: string[] = [];
    // Example compile command: g++ -DDEBUG -Iinclude -o output file.cpp
    const regex = RegExp(/\/D(\S+)|\-D(\S+)/, 'g');
    
    const matches = compileCommand.matchAll(regex);
    
    for (const match of matches) {
        if (match[1]) {
            defines.push("-D"+match[1]);
        }
        else if (match[2]) {
            defines.push("-D"+match[2]);
        }
    }

    return defines;
}

function getIncludePathsFromCompileCommand(compileCommand: string): string[] {

    let includePaths: string[] = [];
    const regex = RegExp(/\-I(\S+)/, 'g');
    
    const matches = compileCommand.matchAll(regex);
    
    for (const match of matches) {
        includePaths.push("-I"+match[1]);
    }

    return includePaths;
}

function runCppcheck(fileToCheck: vscode.TextDocument,
    cppcheckExePath: string,
    minSevString: string,
    diagnosticCollection: vscode.DiagnosticCollection,
    buildDirectory: string,
    compileCommandsPath: string,
    useCompileCommands: boolean,
    startTime: number, 
    statusBarItem: vscode.StatusBarItem) {

    diagnosticCollection.clear();

    const capitalizeFirstLetter = (text: string): string => {
        return text.replace(/(^[a-z])(?=:)/g, (match) => match.toUpperCase());
    };
    const filePath = capitalizeFirstLetter(fileToCheck.fileName);

    let cppcheckConfigPath = findCppcheckConfig(filePath);
    if (!cppcheckConfigPath) {
        output_channel.appendLine("Did not find .cppcheck-config file");
        vscode.window.showErrorMessage(`No .cppcheck-config file found. Please create one and place it just like you would a .clang-tidy or .clang-format file. `);
        statusBarItem.text = "Error checking " + path.basename(fileToCheck.fileName);
        setTimeout(() => {
            statusBarItem.dispose();
        }, 2000);
        return;
    }

    output_channel.appendLine(`Found .cppcheck-config: ${cppcheckConfigPath}`);
    let cppcheck_config_params = readCppcheckConfig(cppcheckConfigPath);

    let cppcheckParameterTemplate = '--xml';
    let cppcheckParameterFileFilter = `--file-filter="${filePath}"`;
    let cppcheckParameterProject = `--project="${compileCommandsPath}"`;

    let compileCommandsParams = getParametersFromCompileCommands(compileCommandsPath, filePath);

    if (!useCompileCommands) {
        // Clear this as we expect the user to configure the rest via the .cppcheck-config file
        cppcheckParameterProject = "";
    }
    let cppcheckXmlFile = "cppcheck_errors" + xmlFileIndex.toString() + ".xml";
    xmlFileIndex++;

    let cppcheckCommand = `"${cppcheckExePath}" ${filePath} ${cppcheck_config_params.join(' ')} ${compileCommandsParams.join(' ')} ${cppcheckParameterTemplate} 2> ${cppcheckXmlFile}`;
    cppcheckCommand = cppcheckCommand.replace(/\\/g, '/');

    const minSevNum = parseMinSeverity(minSevString);

    let endTime = Date.now();
    output_channel.appendLine(`Time taken to gather parameters: ${endTime - startTime}ms`);

    output_channel.appendLine("Running command: " + cppcheckCommand);
    startTime = Date.now();

    cp.exec(cppcheckCommand, async (error, stdout, stderr) => {
        if (error) {
            output_channel.appendLine("Error checking version: " + error.message);
            output_channel.appendLine("stdout: " + stdout);
            output_channel.appendLine("stderr: " + stderr);
            vscode.window.showErrorMessage(`Cppcheck-Turbo: ${error.message}`);
            statusBarItem.text = "Error checking " + path.basename(fileToCheck.fileName);
            setTimeout(() => {
                statusBarItem.dispose();
            }, 2000);
            return;
        }
        else {
            endTime = Date.now();
            output_channel.appendLine("Finished running cppcheck. Parsing output now. ");
            output_channel.appendLine(`Time taken to run cppcheck: ${endTime - startTime}ms`);

            try {
                const data = fs.readFileSync(cppcheckXmlFile, 'utf-8');
                startTime = Date.now();
                parseCppcheckOutput(data, minSevNum, diagnosticCollection);
                endTime = Date.now();
                output_channel.appendLine(`Time taken to parse output: ${endTime - startTime}ms`);
                statusBarItem.text = "Done checking " + path.basename(fileToCheck.fileName);
                setTimeout(() => {
                    statusBarItem.dispose();
                }, 2000);
            }
            catch {
                statusBarItem.text = "Error checking " + path.basename(fileToCheck.fileName);
                setTimeout(() => {
                    statusBarItem.dispose();
                }, 2000);
            }
            finally {
                fs.unlink(cppcheckXmlFile, (err) => {
                    if (err) {
                        console.error(`Error deleting the ${cppcheckXmlFile}:`, err);
                        output_channel.append(`Error deleting the ${cppcheckXmlFile}: ${err}`);
                        return;
                    }
                    console.log('File deleted successfully');
                    output_channel.append(`${cppcheckXmlFile} deleted successfully`);
                });

            }
        }
    });

}

// This method is called when your extension is deactivated
export function deactivate() { }
