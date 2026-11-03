import { spawn } from 'node:child_process';
import { win32 } from 'node:path';

const localPath = value => typeof value === 'string' && /^[A-Za-z]:[\\/]/.test(value)
  && !/[\x00-\x1f]/.test(value) && !value.slice(2).includes(':');
const comparablePath = value => win32.normalize(value).replace(/\\+$/, '').toLowerCase();
const sid = value => typeof value === 'string' && /^S-1-\d+(?:-\d+)+$/.test(value);
const unsafeStorage = () => Object.assign(new Error('unsafe_storage'), { code: 'YESSR_UNSAFE_STORAGE' });

export function isWindowsPrivateMetadata(data, expectedPath) {
  if (!localPath(expectedPath) || !data || typeof data !== 'object' || Array.isArray(data)
    || !localPath(data.path) || comparablePath(data.path) !== comparablePath(expectedPath)
    || data.fileSystem !== 'NTFS' || !['Fixed', 'Removable'].includes(data.driveType)
    || !sid(data.userSid) || !sid(data.ownerSid) || data.daclPresent !== true || !Array.isArray(data.aces)) return false;
  const trusted = new Set([data.userSid, 'S-1-5-18', 'S-1-5-32-544']);
  if (!trusted.has(data.ownerSid)) return false;
  return data.aces.every(ace => {
    if (!ace || typeof ace !== 'object' || Array.isArray(ace) || !sid(ace.sid)
      || !['Allow', 'Deny'].includes(ace.type) || !Number.isInteger(ace.mask)
      || ace.mask < -2147483648 || ace.mask > 2147483647
      || !Number.isInteger(ace.flags) || ace.flags < 0 || ace.flags > 31) return false;
    return ace.type === 'Deny' || ace.mask === 0 || trusted.has(ace.sid)
      || (ace.sid === 'S-1-3-0' && (ace.flags & 8) !== 0);
  });
}

const command = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $path = $request.path
  $item = Get-Item -LiteralPath $path -Force
  if ($item.PSProvider.Name -ne 'FileSystem' -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'unsafe' }
  $actualPath = $item.FullName
  $volume = @(Get-Volume -FilePath $actualPath)
  if ($volume.Count -ne 1) { throw 'unsafe' }
  $acl = Get-Acl -LiteralPath $path
  $bytes = $acl.GetSecurityDescriptorBinaryForm()
  $raw = New-Object System.Security.AccessControl.RawSecurityDescriptor($bytes, 0)
  $owner = $raw.Owner.Value
  if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner) { throw 'unsafe' }
  $aces = @()
  foreach ($ace in $raw.DiscretionaryAcl) {
    if ($ace.GetType() -ne [Security.AccessControl.CommonAce] -or $ace.IsCallback -or $ace.OpaqueLength -ne 0 -or [int]$ace.AceType -notin @(0, 1)) { throw 'unsafe' }
    $type = if ([int]$ace.AceType -eq 0) { 'Allow' } else { 'Deny' }
    $aces += @{ sid=$ace.SecurityIdentifier.Value; type=$type; mask=$ace.AccessMask; flags=[int]$ace.AceFlags }
  }
  @{
    path=$path; fileSystem=[string]$volume[0].FileSystemType; driveType=[string]$volume[0].DriveType
    userSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; ownerSid=$owner
    daclPresent=($null -ne $raw.DiscretionaryAcl -and ([int]$raw.ControlFlags -band 4) -ne 0); aces=@($aces)
  } | ConvertTo-Json -Compress -Depth 4
} catch { exit 1 }
`;

export async function assertWindowsPrivatePath(path) {
  const systemRoot = process.env.SystemRoot;
  if (!localPath(path) || !localPath(systemRoot)) throw unsafeStorage();
  const executable = win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const output = await new Promise((resolve, reject) => {
    let child, timer, settled = false, size = 0;
    const chunks = [];
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) child?.kill();
      child?.stdin.destroy();
      child?.stdout.destroy();
      child?.stderr.destroy();
      if (error) reject(unsafeStorage()); else resolve(value);
    };
    try {
      child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      });
      timer = setTimeout(() => finish(true), 5000);
      child.on('error', () => finish(true));
      child.stdin.on('error', () => finish(true));
      child.stdout.on('error', () => finish(true));
      child.stderr.on('error', () => finish(true));
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
        size += chunk.length;
        if (size > 256 * 1024) return finish(true);
        if (stream === child.stdout) chunks.push(chunk);
      });
      child.on('close', code => finish(code !== 0, Buffer.concat(chunks).toString('utf8')));
      child.stdin.end(JSON.stringify({ path }), 'utf8');
    } catch { finish(true); }
  });
  let metadata;
  try { metadata = JSON.parse(output); } catch { throw unsafeStorage(); }
  if (!isWindowsPrivateMetadata(metadata, path)) throw unsafeStorage();
}
