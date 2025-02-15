import json
import sys
import os
import subprocess


def find_compile_command(compile_commands_path, target_file_path):
    # Load the compile_commands.json file
    with open(compile_commands_path, 'r') as f:
        compile_commands = json.load(f)
    
    # Normalize the target file path to ensure consistency
    target_file_path = os.path.normpath(target_file_path).lower()
    
    # Search for the compile command that matches the target file
    for command in compile_commands:
        file_command = os.path.normpath(command['file']).lower()
        if file_command == target_file_path:
            return [command]  # Return as a list to match the original structure
    
    # If no matching command is found, return an empty list
    return []

def save_compile_commands(output_path, compile_commands):
    # Save the filtered compile commands to the output file
    with open(output_path, 'w') as f:
        json.dump(compile_commands, f, indent=4)
        
def find_cppcheck_config(file_path):
    """
    Search for a .cppcheck-config file starting in the same directory as the file being checked.
    If not found, it moves up to the parent directories until the root directory is reached.
    Returns the path to the .cppcheck-config file if found, otherwise returns None.
    """
    # Get the directory of the file being checked
    current_dir = os.path.dirname(os.path.abspath(file_path))
    
    while True:
        config_path = os.path.join(current_dir, '.cppcheck-config')
        if os.path.isfile(config_path):
            return config_path
        # Move up to the parent directory
        parent_dir = os.path.dirname(current_dir)
        if parent_dir == current_dir:  # Reached the root directory
            return None
        current_dir = parent_dir

def read_cppcheck_config(config_path):
    """
    Read the .cppcheck-config file and return a list of parameters.
    Each line in the file represents a parameter.
    """
    with open(config_path, 'r') as f:
        # Read lines, strip whitespace, and filter out empty lines
        return [line.strip() for line in f.readlines() if line.strip()]

def run_cppcheck(file_name, compile_commands):
    """
    Run cppcheck on the specified file using parameters from .cppcheck-config.
    """
    # Find the .cppcheck-config file
    config_path = find_cppcheck_config(file_name)
    if not config_path:
        print("Error: .cppcheck-config file not found.")
        return
    
    # Read the parameters from the config file
    cppcheck_params = read_cppcheck_config(config_path)
    
    # Build the cppcheck command
    command = ['cppcheck', '--project=' + compile_commands] + cppcheck_params
    
    # Run the command
    try:
        print(f"Running cppcheck with command: {' '.join(command)}")
        result = subprocess.run(command, check=True, text=True, capture_output=True)
        print(result.stdout)  # Print cppcheck output

        if result.stdout:
            print(result.stdout)

        # Print stderr
        if result.stderr:
            print(result.stderr, file=sys.stderr)

    except subprocess.CalledProcessError as e:
        print(f"cppcheck failed with error: {e.stderr}")
    except FileNotFoundError:
        print("Error: cppcheck is not installed or not found in PATH.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python script.py <compile_commands.json> <target_file>")
        sys.exit(1)

    print("Current working directory:", os.getcwd())
    
    compile_commands_path = sys.argv[1]
    target_file_path = sys.argv[2]
    
    # Find the compile command for the target file
    filtered_commands = find_compile_command(compile_commands_path, target_file_path)
    
    if not filtered_commands:
        print(f"No compile command found for file: {target_file_path}")
        sys.exit(1)
    
    
    # Save the filtered compile command to a new file
    output_path = os.path.join(os.path.dirname(compile_commands_path), 'compile_commands_cppcheck.json')
    save_compile_commands(output_path, filtered_commands)
    print(f"Filtered compile command saved to: {output_path}")

    run_cppcheck(target_file_path, output_path)
    
