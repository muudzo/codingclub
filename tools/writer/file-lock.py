"""Hold the publishing lock until the parent closes stdin; crashes release it."""
import fcntl
import os
import sys

descriptor = os.open(sys.argv[1], os.O_CREAT | os.O_RDWR, 0o600)
with os.fdopen(descriptor, "a") as lock:
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        sys.exit(75)
    print("locked", flush=True)
    sys.stdin.buffer.read()
