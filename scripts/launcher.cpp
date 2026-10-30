#include <windows.h>
#include <string>

static std::wstring g_logFile;

static std::wstring ExeDirectory()
{
    wchar_t buffer[MAX_PATH * 4];
    DWORD length = GetModuleFileNameW(NULL, buffer, MAX_PATH * 4);
    std::wstring path(buffer, length);
    size_t slash = path.find_last_of(L"\\/");
    if (slash != std::wstring::npos) path.resize(slash + 1);
    return path;
}

static void AppendLog(const std::wstring& message)
{
    if (g_logFile.empty()) return;
    HANDLE file = CreateFileW(g_logFile.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE,
                              NULL, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (file == INVALID_HANDLE_VALUE) return;

    SYSTEMTIME st;
    GetLocalTime(&st);
    wchar_t prefix[64];
    swprintf(prefix, 64, L"[%04u-%02u-%02u %02u:%02u:%02u] ",
             st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond);
    std::wstring line = std::wstring(prefix) + message + L"\r\n";
    int bytes = WideCharToMultiByte(CP_UTF8, 0, line.c_str(), (int)line.size(), NULL, 0, NULL, NULL);
    if (bytes > 0)
    {
        std::string utf8(bytes, 0);
        WideCharToMultiByte(CP_UTF8, 0, line.c_str(), (int)line.size(), &utf8[0], bytes, NULL, NULL);
        DWORD written = 0;
        WriteFile(file, utf8.data(), (DWORD)utf8.size(), &written, NULL);
    }
    CloseHandle(file);
}

static void InitLog(const std::wstring& baseDir)
{
    // 便携版优先写到程序目录，确保桌面会话一定可读；LocalAppData 作为兜底。
    g_logFile = baseDir + L"launcher.log";
}

static std::wstring Quote(const std::wstring& value)
{
    return L"\"" + value + L"\"";
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, LPWSTR, int)
{
    std::wstring baseDir = ExeDirectory();
    InitLog(baseDir);
    AppendLog(L"launcher start; base=" + baseDir);

    std::wstring runtime = baseDir + L"OrbitRuntime.exe";
    if (GetFileAttributesW(runtime.c_str()) == INVALID_FILE_ATTRIBUTES)
    {
        AppendLog(L"runtime missing: " + runtime);
        MessageBoxW(NULL,
                    L"找不到 OrbitRuntime.exe。\n请确认整个 OrbitIDE 文件夹完整后再运行。",
                    L"Orbit IDE 启动失败", MB_OK | MB_ICONERROR);
        return 1;
    }

    SetEnvironmentVariableW(L"ELECTRON_RUN_AS_NODE", NULL);

    std::wstring command = Quote(runtime) +
        L" --enable-logging --v=1 --log-file=" + Quote(baseDir + L"runtime.log") +
        L" --disable-gpu --disable-gpu-sandbox --disable-breakpad";
    AppendLog(L"command=" + command);

    STARTUPINFOW si;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi;
    ZeroMemory(&pi, sizeof(pi));

    std::wstring working = baseDir;
    BOOL started = CreateProcessW(
        runtime.c_str(),
        &command[0],
        NULL,
        NULL,
        FALSE,
        CREATE_NO_WINDOW,
        NULL,
        working.c_str(),
        &si,
        &pi);

    if (!started)
    {
        DWORD error = GetLastError();
        wchar_t message[512];
        swprintf(message, 512, L"无法启动 Orbit IDE 运行时。\nWindows 错误码：%lu\n\n日志：%s",
                 error, g_logFile.c_str());
        AppendLog(L"CreateProcess failed; error=" + std::to_wstring(error));
        MessageBoxW(NULL, message, L"Orbit IDE 启动失败", MB_OK | MB_ICONERROR);
        return 1;
    }

    AppendLog(L"runtime started; pid=" + std::to_wstring(pi.dwProcessId));
    DWORD startTick = GetTickCount();
    WaitForSingleObject(pi.hProcess, INFINITE);

    DWORD exitCode = 0;
    GetExitCodeProcess(pi.hProcess, &exitCode);
    DWORD elapsed = GetTickCount() - startTick;
    AppendLog(L"runtime exited; code=" + std::to_wstring(exitCode) + L"; uptime_ms=" + std::to_wstring(elapsed));

    if (exitCode != 0 && elapsed < 15000)
    {
        wchar_t message[1024];
        swprintf(message, 1024,
                 L"Orbit IDE 运行时启动失败（退出码 %lu）。\n\n诊断日志：\n%s",
                 exitCode, g_logFile.c_str());
        MessageBoxW(NULL, message, L"Orbit IDE 启动失败", MB_OK | MB_ICONERROR);
    }

    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return 0;
}
