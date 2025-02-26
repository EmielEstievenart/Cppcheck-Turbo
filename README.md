# Cppcheck Turbo

**Cppcheck Turbo** runs [Cppcheck](https://cppcheck.sourceforge.net/) against C/C++ files upon save and reports any warnings or errors in the problems panel. This is version is based on https://github.com/JustusRijke/Cppcheck-Lite by JustusRijke. Cppcheck Turbo uses `compile_commands.json` to provide Cppcheck with the necessary information to analyze a complex project. Cppcheck Turbo also uses a `.cppcheck-config` file to customize how Cppcheck checks individual files. You can think of a `.cppcheck-config` file as similar to a .clang-tidy or .clang-format file.

## Features

- **On-save linting**: When you save a C/C++ file, `Cppcheck` is automatically run on that file.
- **Per-file diagnostics**: Only diagnostics relevant to the saved file and its includes are displayed. The file filter in the problems panel allows even more fine tuning. 
- **Configurable severity threshold**: Filter out messages below a chosen severity level (`info`, `warning`, or `error`).
- **`.cppcheck-config`**: Cppcheck Turbo searches for a `.cppcheck-config` file in the same folder or up as the file being checked. This allows for easy configuration of Cppcheck by adding a `.cppcheck-config` file to your project.
- **Output window diagnostics**: In case of problems, you can monitor the plugin in the output tab in its own channel. 

![Local GIF](https://github.com/EmielEstievenart/Cppcheck-Turbo/blob/main/images/howTo.gif?raw=true)

## Requirements

 **Cppcheck** must be installed on your system.  
  - By default, this extension looks for `cppcheck` on the system PATH.
  - Alternatively, specify a custom executable path using the e`cppcheck-turbo.path` setting.

 **`.cppcheck-config`**
A `.cppcheck-config` in the root of your project is ideal. Additional `.cppcheck-config` files can be added on different levels to allow different parts of your project to be checked with fine tuned rules.  Each line in the `.cppcheck-config` represents a parameter for Cppcheck. Lines can be temporarily disabled by prefixing them with a #. 

Example of a `.cppcheck-config` file: 
```
--std=c++17
--check-level=exhaustive
-DTEST=1
#this is a comment
```
## Warning 
Do not specifiy a template in the `.cppcheck-config` for Cppcheck. This tool uses the --xml parameter with Cppcheck to parse the output. 

## Extension Settings

This extension contributes the following settings under `cppcheck-Turbo.*`:

- **`cppcheck-turbo.enable`**: (boolean) Enable or disable the extension.  
- **`cppcheck-turbo.minSeverity`**: (string) Minimum severity to report (`info`, `warning`, or `error`).  `info` shows style, performance, portability and information messages.
- **`cppcheck-turbo.compileCommandsPath`**: (string) The path relative to the root of the workspace to the compile_commands.json. By default it searches the workspace root. This works well with the "cmake.copyCompileCommands" setting if you set it to "${workspaceFolder}/compile_commands.json".
- **`cppcheck-turbo.path`**: (string) Path to the `cppcheck` executable. If left empty, `cppcheck` from the system PATH is used.
- **`cppcheck-turbo.BuildDirectory`**: (string) Relative path to the workspace where Cppcheck will output it's build output. If empty, uses the workspace workspaceRoot/cppcheck-turbo-build
- **`cppcheck-turbo.useCompileCommands`**: (boolean) Use this if you want to specify your project details in a different way via the `.cppcheck-config` file and not use compile_commands.json. 

## Reporting Issues
Please submit any issues or feature requests via the [GitHub Issues page](https://github.com/EmielEstievenart/Cppcheck-Turbo/issues).

---

**Enjoy using Cppcheck Turbo!**
