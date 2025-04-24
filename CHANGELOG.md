# Change Log

## [2.0.10] - 2025-04-24
- Fix file not being founf via compile commands for parsing.
- Fix defines not being parsed correctly from compile commands.

## [2.0.9] - 2025-04-21
- Parse compile_commands.json for defines and include directories. Cppcheck is no longer called with the project flag. This allows adding include directories and in the future even modifying them. 

## [2.0.8] - 2025-03-01
- Correct source of problems showing Cppcheck-Turbo in problems tab

## [2.0.7] - 2025-03-01
- Fix bug where cppchecking would stay visible if no .cppcheck-config is found. 

## [2.0.6] - 2025-03-01
- Fix bug where Cppcheck done was shown before it was done.
- Fix bug that would run Cppcheck by just opening files.
- Remove Cppcheck Turbo: prefix in output window as it's already in it's own channel.
- Add testing to plugin categories.
- Update readme
    - Remove build directory. This isn't usefull when checking individual files. 
    - Fix typos in readme.


## [2.0.5] - 2025-02-26
- Change link to GIF to git repo so maybe now it works.

## [2.0.4] - 2025-02-26
- Fix typos in readme.
- Add HowTo.gif.
- Fix status display not working due to mis use of async.

## [2.0.3] - 2025-02-22
- Initial published release.

## [0.0.0] - 2025-02-08
- Internal development.
