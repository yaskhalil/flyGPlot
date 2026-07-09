import sys
import os

# Add the src folder to the python path so tests can find backend and frontend modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../src')))
