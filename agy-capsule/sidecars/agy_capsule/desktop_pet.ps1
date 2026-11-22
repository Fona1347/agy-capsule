$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, System.Windows.Forms

# These streams are private pipes to server.mjs. Use explicit UTF-8 on PowerShell 5.1.
$utf8 = [Text.UTF8Encoding]::new($false)
$reader = [IO.StreamReader]::new([Console]::OpenStandardInput(), $utf8)
$writer = [IO.StreamWriter]::new([Console]::OpenStandardOutput(), $utf8)
$writer.AutoFlush = $true
function Send-PetAction($data) {
    try { $writer.WriteLine((ConvertTo-Json -InputObject $data -Compress)) } catch { if ($win.IsVisible) { $win.Close() } }
}

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="agy-capsule Desktop Pet" WindowStyle="None" ResizeMode="NoResize"
        SizeToContent="WidthAndHeight" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ShowActivated="False">
  <StackPanel>
    <Border Name="Face" Width="94" HorizontalAlignment="Left" Background="Transparent"
            Focusable="True" Cursor="Hand">
      <StackPanel>
        <Grid Width="80" Height="80">
          <Border Name="Placeholder" Background="#332334" CornerRadius="20" Margin="8">
            <TextBlock Text="◆" FontSize="39" Foreground="#FF9259"
                       HorizontalAlignment="Center" VerticalAlignment="Center"/>
          </Border>
          <Image Name="Sprite" Stretch="Uniform"/>
        </Grid>
        <Border Name="StatusBadge" Background="#292331" HorizontalAlignment="Center"
                Padding="8,3" CornerRadius="8" MaxWidth="94">
          <TextBlock Name="Status" Foreground="#FFF5ED" FontSize="11" TextTrimming="CharacterEllipsis"/>
        </Border>
      </StackPanel>
    </Border>
    <Border Name="Composer" Width="310" Visibility="Collapsed" Margin="0,6,0,0"
            Background="#292331" BorderBrush="#614452" BorderThickness="1" CornerRadius="12" Padding="11">
      <StackPanel>
        <TextBlock Name="Target" Foreground="#F0CFC4" TextWrapping="Wrap" Margin="0,0,0,6"/>
        <TextBox Name="Prompt" MinHeight="60" MaxHeight="130" MaxLength="4000" AcceptsReturn="True"
                 TextWrapping="Wrap" VerticalScrollBarVisibility="Auto" Padding="6"
                 AutomationProperties.Name="First message"/>
        <WrapPanel Margin="0,8,0,0">
          <WrapPanel.Resources>
            <Style TargetType="Button"><Setter Property="Padding" Value="7,4"/><Setter Property="Margin" Value="0,0,5,4"/></Style>
          </WrapPanel.Resources>
          <Button Name="Send"/>
          <Button Name="Open"/>
          <Button Name="Follow"/>
          <Button Name="Hide"/>
        </WrapPanel>
        <TextBlock Name="Feedback" Foreground="#FFD5C7" TextWrapping="Wrap"/>
      </StackPanel>
    </Border>
  </StackPanel>
</Window>
'@
$win = [System.Windows.Markup.XamlReader]::Load([System.Xml.XmlNodeReader]::new($xaml))
$face = $win.FindName('Face')
$sprite = $win.FindName('Sprite')
$placeholder = $win.FindName('Placeholder')
$status = $win.FindName('Status')
$badge = $win.FindName('StatusBadge')
$composer = $win.FindName('Composer')
$target = $win.FindName('Target')
$prompt = $win.FindName('Prompt')
$send = $win.FindName('Send')
$open = $win.FindName('Open')
$follow = $win.FindName('Follow')
$hide = $win.FindName('Hide')
$feedback = $win.FindName('Feedback')

$strings = @{
    en = @{
        idle='Idle'; unknown='Checking'; queued='Queued'; running='Working'; completed='Done'; failed='Failed'; interrupted='Interrupted'
        send='New chat'; open='Open chat'; follow='Follow selected'; hide='Hide'; target='Project · '
        noProject='Open the agy-capsule sidebar in a project to set the target.'
        sending='Starting a chat…'; unconfirmed='Could not confirm the send. Check Antigravity before trying again.'
        projectChanged='The project changed. Check the target and send again.'
        invalidPrompt='Enter a first message.'
        openUnavailable='Could not open that chat. Check the Antigravity window and its debugging connection.'
    }
    'zh-CN' = @{
        idle='空闲'; unknown='等待状态'; queued='排队中'; running='正在工作'; completed='已完成'; failed='失败'; interrupted='已中断'
        send='新建对话'; open='打开对话'; follow='跟随当前对话'; hide='隐藏'; target='项目 · '
        noProject='请在项目中打开 agy-capsule 侧栏，以确定发送目标。'
        sending='正在新建对话…'; unconfirmed='未能确认消息是否发出，请先到 Antigravity 检查。'
        projectChanged='项目已切换，请确认目标后再发送。'
        invalidPrompt='请先输入第一条消息。'
        openUnavailable='未能打开该对话，请检查 Antigravity 窗口及调试连接。'
    }
    'zh-TW' = @{
        idle='閒置'; unknown='等待狀態'; queued='排隊中'; running='正在工作'; completed='已完成'; failed='失敗'; interrupted='已中斷'
        send='新增對話'; open='開啟對話'; follow='跟隨目前對話'; hide='隱藏'; target='專案 · '
        noProject='請在專案中開啟 agy-capsule 側欄，以選定傳送目標。'
        sending='正在新增對話…'; unconfirmed='無法確認訊息是否送出，請先到 Antigravity 檢查。'
        projectChanged='專案已切換，請確認目標後再傳送。'
        invalidPrompt='請先輸入第一則訊息。'
        openUnavailable='無法開啟該對話，請檢查 Antigravity 視窗及偵錯連線。'
    }
}
$script:labels = $strings.en
$script:view = @{state='idle'; projectId=''; canOpen=$false; pinned=$false}
$script:busy = $false
$script:notice = ''
$script:parentClosed = $false
$script:dragStart = $null

$assets = Join-Path $PSScriptRoot 'pet-assets'
$frameCache = @{}
$script:frames = @()
$script:frameIndex = 0
$script:drawnState = ''
$frameTimer = [System.Windows.Threading.DispatcherTimer]::new()
$frameTimer.Interval = [TimeSpan]::FromMilliseconds(83)
function Read-Frame($file) {
    $image = [System.Windows.Media.Imaging.BitmapImage]::new()
    $image.BeginInit()
    $image.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
    $image.UriSource = [Uri]::new($file)
    $image.EndInit()
    $image.Freeze()
    return $image
}
function Show-Sprite([string]$state) {
    if ($script:drawnState -eq $state) { return }
    $script:drawnState = $state
    $frameTimer.Stop()
    if (-not $frameCache.ContainsKey($state)) {
        $files = @(Get-ChildItem -LiteralPath $assets -Filter "$state-*.png" -File -ErrorAction SilentlyContinue |
            Where-Object Name -Match ('^' + $state + '-[0-9]{2}\.png$') | Sort-Object Name)
        if ($files.Count -eq 0) {
            $files = @(Get-Item -LiteralPath (Join-Path $assets "$state.png") -ErrorAction SilentlyContinue)
        }
        if ($files.Count -eq 0 -and $state -ne 'idle') {
            $files = @(Get-Item -LiteralPath (Join-Path $assets 'idle.png') -ErrorAction SilentlyContinue)
        }
        $frameCache[$state] = @(foreach ($file in $files) {
            try { Read-Frame $file.FullName } catch { }
        })
    }
    $script:frames = $frameCache[$state]
    $script:frameIndex = 0
    $sprite.Source = if ($script:frames.Count) { $script:frames[0] } else { $null }
    $placeholder.Visibility = if ($sprite.Source) { 'Collapsed' } else { 'Visible' }
    if ($script:frames.Count -gt 1 -and $state -notin 'idle', 'unknown' -and [System.Windows.SystemParameters]::ClientAreaAnimation) {
        $frameTimer.Start()
    }
}
$frameTimer.Add_Tick({
    if ($script:frameIndex -eq $script:frames.Count - 1 -and $script:drawnState -notin 'running', 'queued') {
        $frameTimer.Stop()
        return
    }
    $script:frameIndex = ($script:frameIndex + 1) % $script:frames.Count
    $sprite.Source = $script:frames[$script:frameIndex]
})

function Refresh-Pet {
    $status.Text = $script:labels[$script:view.state]
    $face.ToolTip = $status.Text
    $badgeColor = switch ($script:view.state) {
        'running' { '#623C28' }
        'queued' { '#60451A' }
        'completed' { '#245148' }
        'failed' { '#773440' }
        default { '#292331' }
    }
    $badge.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString($badgeColor)
    $target.Text = if ($script:view.projectId) { $script:labels.target + $script:view.projectId } else { $script:labels.noProject }
    $send.Content = $script:labels.send
    $open.Content = $script:labels.open
    $follow.Content = $script:labels.follow
    $hide.Content = $script:labels.hide
    $send.IsEnabled = -not $script:busy -and [bool]$script:view.projectId
    $open.IsEnabled = -not $script:busy -and $script:view.canOpen
    $follow.Visibility = if ($script:view.pinned) { 'Visible' } else { 'Collapsed' }
    $feedback.Text = if ($script:notice) { $script:labels[$script:notice] } else { '' }
    Show-Sprite $script:view.state
}
function Toggle-Composer {
    if ($composer.IsVisible) { $composer.Visibility = 'Collapsed'; return }
    $composer.Visibility = 'Visible'
    $win.UpdateLayout()
    $handle = [System.Windows.Interop.WindowInteropHelper]::new($win).Handle
    $work = [System.Windows.Forms.Screen]::FromHandle($handle).WorkingArea
    $topLeft = $win.PointFromScreen([System.Windows.Point]::new($work.Left, $work.Top))
    $bottomRight = $win.PointFromScreen([System.Windows.Point]::new($work.Right, $work.Bottom))
    $win.Left += [Math]::Max($topLeft.X, [Math]::Min(0, $bottomRight.X - $win.ActualWidth))
    $win.Top += [Math]::Max($topLeft.Y, [Math]::Min(0, $bottomRight.Y - $win.ActualHeight))
    $null = $prompt.Focus()
}
function Start-Chat {
    if (-not $send.IsEnabled) { return }
    if ([string]::IsNullOrWhiteSpace($prompt.Text)) {
        $script:notice = 'invalidPrompt'
        Refresh-Pet
        return
    }
    $script:busy = $true
    $prompt.IsReadOnly = $true
    $script:notice = 'sending'
    Refresh-Pet
    Send-PetAction @{action='send'; message=$prompt.Text; projectId=$script:view.projectId}
}
$face.Add_MouseLeftButtonDown({
    param($sender, $eventArgs)
    $script:dragStart = $eventArgs.GetPosition($face)
    $null = $face.CaptureMouse()
})
$face.Add_MouseMove({
    param($sender, $eventArgs)
    if ($null -eq $script:dragStart -or $eventArgs.LeftButton -ne 'Pressed') { return }
    $point = $eventArgs.GetPosition($face)
    if ([Math]::Abs($point.X - $script:dragStart.X) -lt [System.Windows.SystemParameters]::MinimumHorizontalDragDistance -and
        [Math]::Abs($point.Y - $script:dragStart.Y) -lt [System.Windows.SystemParameters]::MinimumVerticalDragDistance) { return }
    $script:dragStart = $null
    $face.ReleaseMouseCapture()
    try { $win.DragMove() } catch { }
})
$face.Add_MouseLeftButtonUp({
    if ($null -eq $script:dragStart) { return }
    $script:dragStart = $null
    $overFace = $face.IsMouseOver
    $face.ReleaseMouseCapture()
    if ($overFace) { Toggle-Composer }
})
$face.Add_LostMouseCapture({ $script:dragStart = $null })
$face.Add_KeyDown({ param($sender, $e) if ($e.Key -in 'Enter', 'Space') { Toggle-Composer; $e.Handled = $true } })
$win.Add_PreviewKeyDown({
    param($sender, $e)
    if ($composer.IsVisible -and $e.Key -eq 'Escape') { Toggle-Composer; $e.Handled = $true }
    if ($composer.IsVisible -and $e.Key -eq 'Enter' -and [System.Windows.Input.Keyboard]::Modifiers -eq 'Control') {
        Start-Chat
        $e.Handled = $true
    }
})
$send.Add_Click({ Start-Chat })
$open.Add_Click({ Send-PetAction @{action='open'} })
$follow.Add_Click({ Send-PetAction @{action='follow'} })
$hide.Add_Click({ $win.Close() })

# StreamReader's asynchronous read keeps the window responsive while stdin is idle.
$script:nextLine = $reader.ReadLineAsync()
$pipeTimer = [System.Windows.Threading.DispatcherTimer]::new()
$pipeTimer.Interval = [TimeSpan]::FromMilliseconds(120)
$pipeTimer.Add_Tick({
    if (-not $script:nextLine.IsCompleted) { return }
    try { $line = $script:nextLine.GetAwaiter().GetResult() } catch { $line = $null }
    if ($null -eq $line) { $script:parentClosed = $true; $win.Close(); return }
    $script:nextLine = $reader.ReadLineAsync()
    $data = ConvertFrom-Json -InputObject $line
    if ($data.state) {
        $script:view = $data
        $script:labels = if ($data.language -and $strings.ContainsKey($data.language)) { $strings[$data.language] } else { $strings.en }
    } elseif ($data.result -in 'opened', 'openUnavailable') {
        $script:notice = if ($data.result -eq 'opened') { '' } else { $data.result }
        if ($data.result -eq 'opened') { $composer.Visibility = 'Collapsed' }
    } elseif ($data.result) {
        $script:busy = $false
        $prompt.IsReadOnly = $false
        $script:notice = if ($data.result -eq 'sent') { '' } else { $data.result }
        if ($data.result -eq 'sent') { $prompt.Clear(); $composer.Visibility = 'Collapsed' }
    }
    Refresh-Pet
})
$win.Add_Closed({
    $pipeTimer.Stop()
    $frameTimer.Stop()
    if (-not $script:parentClosed) { Send-PetAction @{action='hide'} }
    [System.Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvokeShutdown('Background')
})
$work = [System.Windows.SystemParameters]::WorkArea
$win.Left = [Math]::Max($work.Left, $work.Right - 336)
$win.Top = [Math]::Max($work.Top, $work.Bottom - 240)
Refresh-Pet
$pipeTimer.Start()
$win.Show()
[System.Windows.Threading.Dispatcher]::Run()
