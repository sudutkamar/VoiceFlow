param([string]$hwndInput, [uint32]$targetTid)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NI {
  [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h, int nCmdShow);
  [DllImport("user32.dll")]public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")]public static extern void keybd_event(byte b,byte s,uint f,UIntPtr e);
  [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")]public static extern bool AttachThreadInput(uint a, uint b, bool c);
  [DllImport("user32.dll")]public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")]public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")]public static extern bool FlashWindow(IntPtr h, bool invert);
}
"@

# Konversi string input ke IntPtr secara aman
$hwnd = [System.IntPtr]::Zero
if (-not [string]::IsNullOrEmpty($hwndInput)) {
    $hwnd = [System.IntPtr]::new([int64]$hwndInput)
}

if($hwnd -ne [System.IntPtr]::Zero -and [NI]::IsWindow($hwnd)){
  [NI]::ShowWindow($hwnd, 9)|Out-Null; Start-Sleep -m 30
  $fg = [NI]::GetForegroundWindow(); $ourTid = [NI]::GetCurrentThreadId()
  if($targetTid -eq 0){ [uint32]$dummy=0; $targetTid = [NI]::GetWindowThreadProcessId($hwnd, [ref]$dummy) }
  $attached = $false
  if($targetTid -ne $ourTid -and $targetTid -ne 0){ $attached = [NI]::AttachThreadInput($ourTid, $targetTid, $true); Start-Sleep -m 20 }
  [NI]::BringWindowToTop($hwnd)|Out-Null; [NI]::SetForegroundWindow($hwnd)|Out-Null; Start-Sleep -m 50
  $fg = [NI]::GetForegroundWindow()
  if($fg -ne $hwnd){ [NI]::SetForegroundWindow($hwnd)|Out-Null; Start-Sleep -m 50 }
  if($attached){ [NI]::AttachThreadInput($ourTid, $targetTid, $false)|Out-Null }
  Start-Sleep -m 30
}
[NI]::keybd_event(0x11,0,0,[UIntPtr]::Zero); Start-Sleep -m 10
[NI]::keybd_event(0x56,0,0,[UIntPtr]::Zero); Start-Sleep -m 10
[NI]::keybd_event(0x56,0,2,[UIntPtr]::Zero); Start-Sleep -m 10
[NI]::keybd_event(0x11,0,2,[UIntPtr]::Zero)