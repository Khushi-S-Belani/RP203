#!/usr/bin/env python3
import sys
import subprocess
import os

dir_path = os.path.dirname(os.path.realpath(__file__))
bin_path = os.path.join(dir_path, "face_detector")

if os.path.exists(bin_path):
    proc = subprocess.Popen([bin_path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, _ = proc.communicate(input=sys.stdin.read().encode('utf-8'))
    sys.stdout.write(out.decode('utf-8'))
else:
    print('{"count":0,"isCouple":false}')
