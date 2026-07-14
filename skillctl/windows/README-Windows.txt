skillctl Windows 安装说明
=========================

一、安装

1. 将 ZIP 压缩包完整解压到同一个目录。
2. 在解压目录的空白处按住 Shift 并单击鼠标右键，选择“在此处打开 PowerShell 窗口”或“在终端中打开”。
3. 执行以下命令：

   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-skillctl.ps1

4. 安装成功后，关闭并重新打开 PowerShell 或 CMD。
5. 执行以下命令验证安装：

   skillctl help

安装脚本不需要管理员权限。程序将安装到：

   %LOCALAPPDATA%\Programs\skillctl\skillctl.exe

该目录会自动加入当前用户的 PATH，之后可以在任意目录执行 skillctl。


二、首次使用

登录 1Panel：

   skillctl login https://panel.example.com --token <token>

查看当前登录身份：

   skillctl whoami

搜索 Skill：

   skillctl search


三、免安装运行

如果不想执行安装脚本，可以直接运行 EXE：

PowerShell：

   .\skillctl-windows-amd64.exe help

CMD：

   skillctl-windows-amd64.exe help

免安装方式不会配置 PATH，因此不能在其他目录直接执行 skillctl。


四、更新

下载并解压新版本 ZIP，再次执行安装命令即可覆盖旧版本：

   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-skillctl.ps1


五、常见问题

1. 安装成功后提示找不到 skillctl

   请关闭当前终端并重新打开，再执行 skillctl help。

2. 提示找不到 skillctl-windows-amd64.exe

   请确认 EXE 和 install-skillctl.ps1 位于同一个解压目录，不要只单独复制安装脚本。

3. Windows 显示安全警告

   从网络下载且未进行 Authenticode 签名的程序或脚本可能触发 Windows 安全提示。请确认压缩包来自可信的 AI-Portal 地址。
