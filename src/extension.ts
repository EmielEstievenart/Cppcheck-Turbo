import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as CMakeTools from 'vscode-cmake-tools';

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
    const diagnosticCollection = vscode.languages.createDiagnosticCollection("Cppcheck Lite");
    context.subscriptions.push(diagnosticCollection);

    async function handleDocument(document: vscode.TextDocument) {

        output_channel.appendLine("Cppcheck Lite2: Running cppcheck on " + document.fileName);
        // Only process C/C++ files.
        if (!["c", "cpp"].includes(document.languageId)) {
            output_channel.appendLine("Cppcheck Lite2: Not a C/C++ file, skipping.");
            // Not a C/C++ file, skip
            return;
        }

        // Check if the document is visible in any editor
        const isVisible = vscode.window.visibleTextEditors.some(editor => editor.document.uri.toString() === document.uri.toString());
        if (!isVisible) {
            // Document is not visible, skip
            return;
        }

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
            compileCommandsPath
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

async function runCppcheck(
    document: vscode.TextDocument,
    commandPath: string,
    minSevString: string,
    diagnosticCollection: vscode.DiagnosticCollection,
    buildDirectory: string,
    compileCommandsPath: string

): Promise<void> {
    // Clear existing diagnostics for this file
    diagnosticCollection.delete(document.uri);

    output_channel.appendLine("Cppcheck Lite2: Running cppcheck on " + document.fileName);

    const filePath = document.fileName;
    const minSevNum = parseMinSeverity(minSevString);
    const extensionPath = path.normalize(my_context.extensionPath);
    const python_cppcheck = path.normalize(`python ${extensionPath}/src/run_cppcheck_from_config_and_compilecommands.py`);


    // const cmakeTools = vscode.extensions.getExtension('ms-vscode.cmake-tools');
    // if (cmakeTools && cmakeTools.isActive) {

    // }

    // const api = await CMakeTools.getCMakeToolsApi(CMakeTools.Version.v1);
    // if (api) {
    //     let project = await api.getProject(vscode.Uri.file('c:/development/cpp_boilerplate/CMakeLists.txt'));
    //     if(project) {
    //         let buildDir = await project.getBuildDirectory();
    //         if(buildDir)
    //         {
    //             console.log(`CMake project: ${buildDir}`); 
    //         }
    //     }

    //     let proj = await api.getActiveFolderPath();
    //     if(proj) {
    //         console.log(`CMake project folder: ${proj}`);
    //         vscode.Uri.file('c:\development\cpp_boilerplate\CMakeLists.txt');

    //     }

    // }
    // else
    // {

    // }




    const command = `${python_cppcheck} "${commandPath}" "${compileCommandsPath}" "${buildDirectory}" "${filePath}"`.trim();

    output_channel.appendLine("Cppcheck Lite2: Running command: " + command);
    console.log("Cppcheck command:", command);

    cp.exec(command, (error, stdout, stderr) => {
        if (error) {
            output_channel.appendLine("Cppcheck Lite2: Error running cppcheck: " + error.message);
            vscode.window.showErrorMessage(`Cppcheck Lite: ${error.message}`);
            return;
        }

        output_channel.appendLine("Cppcheck Lite2: Finished running cppcheck.");

        const allOutput = stdout + "\n" + stderr;
        const diagnostics: vscode.Diagnostic[] = [];

        // Define the start and end markers
        const startMarker = "START_ERROR";
        const endMarker = "STOP_ERROR";

        // Split the output by the start marker
        const errorBlocks = allOutput.split(startMarker);

        const keys = ["[file]", "[line]", "[column]", "[callstack]", "[inconclusive]", "[severity]", "[message]", "[id]", "[cwe]", "[code]", endMarker];

        let skip = true;
        // Loop through each error block
        for (const block of errorBlocks) {
            // Check if the block contains the end marker
            if (block.includes(endMarker)) {
                //the first one is the template regex
                if (skip === true) {
                    skip = false;
                    continue;
                }

                // Extract the content between the start and end markers
                // const errorContent = block.split(endMarker)[0];

                // Parse the error content
                const errorData: { [key: string]: string } = {};
                const lines = block.trim().split('\r\n');
                let active_key = 0;
                let value: string = '';
                for (let i = 1; i < lines.length - 1; i++) {
                    if (lines[i] === keys[active_key + 1]) {
                        errorData[keys[active_key]] = value.trim();
                        active_key++;
                        value = '';
                    }
                    else {
                        value += lines[i] + '\n';
                    }
                }

                let line = parseInt(errorData["[line]"], 10) - 1;
                if (line < 0) {
                    line = 0;
                }
                let col = parseInt(errorData["[column]"], 10) - 1;
                if (col < 0) {
                    col = 0;
                }

                const diagSeverity = parseSeverity(errorData["[severity]"]);

                // Filter out if severity is less than our minimum
                if (severityToNumber(diagSeverity) < minSevNum) {
                    continue;
                }

                //Only print error if the files are the same
                if (errorData["[file]"].toLowerCase() !== filePath.toLocaleLowerCase()) {
                    continue;
                }

                const range = new vscode.Range(line, col, line, col);
                const diagnostic = new vscode.Diagnostic(range, errorData["[message]"], diagSeverity);
                diagnostic.code = errorData["[cwe]"];
                diagnostic.source = errorData["[id]"]; //If we don't do this, the codes are empty for some reason. 
                diagnostics.push(diagnostic);


                // Now you have the error data in the errorData object
                //console.log(errorData);

                // You can now use the errorData object to display or process the error information
                // For example:
                //vscode.window.showErrorMessage(`Cppcheck Error: ${errorData['message']}`);
            }

            // Example lines we might see:
            //   file.cpp:6:1: error: Something [id]
            //   file.cpp:14:2: warning: Something else [id]
            // const regex = /^(.*?):(\d+):(\d+):\s*(error|warning|style|performance|information|info|note):\s*(.*)(\[.*\])$/gm;

            // let match;
            // while ((match = regex.exec(allOutput)) !== null) {
            //     const [, file, lineStr, colStr, severityStr, message, classifier] = match;
            //     let line = parseInt(lineStr, 10) - 1;
            //     if(line < 0) {
            //         line = 0;
            //     }
            //     let col = parseInt(colStr, 10) - 1;
            //     if(col < 0) {
            //         col = 0;
            //     }

            //     const diagSeverity = parseSeverity(severityStr);

            //     // Filter out if severity is less than our minimum
            //     if (severityToNumber(diagSeverity) < minSevNum) {
            //         continue;
            //     }

            //     //Only print error if the files are the same
            //     if (file.toLowerCase() !== filePath.toLocaleLowerCase()) {
            //         continue;
            //     }

            //     const range = new vscode.Range(line, col, line, col);
            //     const diagnostic = new vscode.Diagnostic(range, message, diagSeverity);
            //     diagnostic.code = classifier;
            //     diagnostic.source = " "; //If we don't do this, the codes are empty for some reason. 

            //     diagnostics.push(diagnostic);
        }

        diagnosticCollection.set(document.uri, diagnostics);
    });
}

// This method is called when your extension is deactivated
export function deactivate() { }
