# Cppcheck Turbo

**Cppcheck Turbo** runs [Cppcheck](https://cppcheck.sourceforge.net/) against C/C++ files upon save and reports any warnings or errors in the problems panel. This version is based on https://github.com/JustusRijke/Cppcheck-Lite by JustusRijke. Cppcheck Turbo uses a `.cppcheck-config` file to customize how Cppcheck checks individual files. You can think of a `.cppcheck-config` file as similar to a .clang-tidy or .clang-format file. Cppcheck Turbo can use `compile_commands.json` to provide Cppcheck with the necessary information to analyze a complex project. Alternatively you can provide defines and include directories via a .cppcheck-config file. 

## Features

- **On-save linting**: When you save a C/C++ file, `Cppcheck` is automatically run on that file.
- **Per-file diagnostics**: Only diagnostics relevant to the saved file and its includes are displayed. The file filter in the problems panel allows even more fine tuning. 
- **Configurable severity threshold**: Filter out messages below a chosen severity level (`info`, `warning`, or `error`).
- **Configurable**: Cppcheck Turbo searches for a `.cppcheck-config` file in the same folder or up as the file being checked. This allows for easy configuration of Cppcheck by adding a `.cppcheck-config` file to your project.
- **Output window diagnostics**: In case of problems, you can monitor the plugin in the output tab in its own channel. 
- **compile_commands parsing**: When used, the compile_commands.json is parsed by Cppcheck Turbo and offers the defines and include directories seperately to Cppcheck. This allows maximum flexibility since you can add extra include directories. Cppcheck doesn't know it's using compile_commands.json. 

![Local GIF](https://github.com/EmielEstievenart/Cppcheck-Turbo/blob/main/images/howTo.gif?raw=true)

## Requirements

 **Cppcheck** must be installed on your system.  
  - By default, this extension looks for `Cppcheck` on the system PATH.
  - Alternatively, specify a custom executable path using the e`cppcheck-turbo.path` setting.

 **.cppcheck-config**
A `.cppcheck-config` in the root of your project is ideal. Additional `.cppcheck-config` files can be added on different levels to allow different parts of your project to be checked with fine tuned rules. Each line in the `.cppcheck-config` represents a parameter for Cppcheck. Lines can be temporarily disabled by prefixing them with a #. 

Example of a `.cppcheck-config` file: 
```
--std=c++17
--check-level=exhaustive
--enable=all
-DTEST=1
-I/extra/include/dir
#this is a comment
```
## Warning 
Do not specify a template in the `.cppcheck-config` for Cppcheck. This tool uses the --xml parameter with Cppcheck to parse the output. 

## Extension Settings

This extension contributes the following settings under `cppcheck-turbo.*`:

- **`cppcheck-turbo.enable`**: (boolean) Enable or disable the extension.  
- **`cppcheck-turbo.autorun`**: (boolean) Enable or disable the Cppcheck Turbo extension.  
- **`cppcheck-turbo.minSeverity`**: (string) Minimum severity to report (`info`, `warning`, or `error`).  `info` shows style, performance, portability and information messages.
- **`cppcheck-turbo.compileCommandsPath`**: (string) The path relative to the root of the workspace to the compile_commands.json. By default it searches the workspace root. This works well with the "cmake.copyCompileCommands" setting from the [CMake Tools](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cmake-tools) plugin if you set it to "${workspaceFolder}/compile_commands.json".
- **`cppcheck-turbo.path`**: (string) Path to the `Cppcheck` executable. If left empty, `Cppcheck` from the system PATH is used.
- **`cppcheck-turbo.useCompileCommands`**: (boolean) Use this if you want to specify your project details in a different way via the `.cppcheck-config` file and not use compile_commands.json. 

## Reporting Issues
Please submit any issues or feature requests via the [GitHub Issues page](https://github.com/EmielEstievenart/Cppcheck-Turbo/issues). Be sure to include output from the output channel. If it is a bug, I will fix it. 

---

**Enjoy using Cppcheck Turbo!**
