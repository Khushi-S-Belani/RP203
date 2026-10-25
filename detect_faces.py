#!/usr/bin/env python3
import sys
import os
import json

dir_path = os.path.dirname(os.path.realpath(__file__))
bin_path = os.path.join(dir_path, "face_detector")

# If legacy native swift binary exists on macOS, use it
if os.path.exists(bin_path) and os.access(bin_path, os.X_OK):
    import subprocess
    proc = subprocess.Popen([bin_path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, _ = proc.communicate(input=sys.stdin.read().encode('utf-8'))
    sys.stdout.write(out.decode('utf-8'))
else:
    # Use Windows & cross-platform face_detector_ai engine
    try:
        import face_detector_ai
        raw_in = sys.stdin.read()
        res = face_detector_ai.process_single(raw_in)
        sys.stdout.write(res)
    except Exception as e:
        sys.stdout.write(json.dumps({"count": 0, "isCouple": False, "error": str(e)}))
