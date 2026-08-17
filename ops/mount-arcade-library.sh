#!/usr/bin/env bash
# Mounts the NAS arcade share at /Volumes/arcade over NFS (hardlink support;
# see docs/library.md). Re-runs are no-ops; an existing AFP/SMB mount is
# replaced. Needs sudo, so run it from a terminal.
set -euo pipefail

REMOTE="${KARLO_LIBRARY_NFS_REMOTE:-data0.local:/volume1/arcade}"
MOUNT_POINT="/Volumes/arcade"

current="$(mount | grep " on ${MOUNT_POINT} (" || true)"

if [[ "${current}" == *"(nfs"* ]]; then
  echo "already mounted via NFS: ${MOUNT_POINT}"
  exit 0
fi

if [[ -n "${current}" ]]; then
  echo "replacing existing mount: ${current}"
  diskutil unmount "${MOUNT_POINT}"
fi

sudo mkdir -p "${MOUNT_POINT}"
sudo mount -t nfs -o resvport "${REMOTE}" "${MOUNT_POINT}"
echo "mounted ${REMOTE} at ${MOUNT_POINT}"
