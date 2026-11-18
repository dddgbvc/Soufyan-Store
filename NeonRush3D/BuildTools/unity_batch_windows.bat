@echo off
rem NEON RUSH - Unity batch-mode helper for Windows.
rem   BuildTools\unity_batch_windows.bat setup   - configure URP + iOS settings, generate scene, validate
rem   BuildTools\unity_batch_windows.bat test    - EditMode + PlayMode tests  -> Builds\TestResults-*.xml
rem   BuildTools\unity_batch_windows.bat xcode   - export iOS Xcode project   -> Builds\iOS\Xcode
rem An IPA cannot be produced on Windows: copy Builds\iOS\Xcode to a Mac and run BuildTools/make_ipa.sh,
rem or use the GitHub Actions workflow (.github/workflows/neonrush-ios.yml), which builds it on macOS.
setlocal
set "PROJ=%~dp0.."
if "%UNITY_PATH%"=="" set "UNITY_PATH=C:\Program Files\Unity\Hub\Editor\2022.3.62f1\Editor\Unity.exe"
if not exist "%UNITY_PATH%" (
  echo Unity not found at "%UNITY_PATH%". Set UNITY_PATH.
  exit /b 1
)
if not exist "%PROJ%\Builds" mkdir "%PROJ%\Builds"
set "MODE=%~1"
if "%MODE%"=="" set "MODE=all"

if /I "%MODE%"=="setup" goto setup
if /I "%MODE%"=="test" goto test
if /I "%MODE%"=="xcode" goto xcode
if /I "%MODE%"=="all" goto setup
echo usage: %~nx0 setup^|test^|xcode^|all
exit /b 2

:setup
"%UNITY_PATH%" -batchmode -quit -projectPath "%PROJ%" -executeMethod NeonRush.EditorTools.NeonRushBuild.SetupCommandLine -logFile "%PROJ%\Builds\unity-setup.log"
if errorlevel 1 ( echo Setup failed - see Builds\unity-setup.log & exit /b 1 )
echo Setup OK
if /I not "%MODE%"=="all" exit /b 0

:test
"%UNITY_PATH%" -batchmode -projectPath "%PROJ%" -runTests -testPlatform EditMode -testResults "%PROJ%\Builds\TestResults-EditMode.xml" -logFile "%PROJ%\Builds\unity-tests-EditMode.log"
echo EditMode exit code %errorlevel% - results in Builds\TestResults-EditMode.xml
"%UNITY_PATH%" -batchmode -projectPath "%PROJ%" -runTests -testPlatform PlayMode -testResults "%PROJ%\Builds\TestResults-PlayMode.xml" -logFile "%PROJ%\Builds\unity-tests-PlayMode.log"
echo PlayMode exit code %errorlevel% - results in Builds\TestResults-PlayMode.xml
if /I not "%MODE%"=="all" exit /b 0

:xcode
"%UNITY_PATH%" -batchmode -quit -projectPath "%PROJ%" -buildTarget iOS -executeMethod NeonRush.EditorTools.NeonRushBuild.BuildIOSCommandLine -customBuildPath "%PROJ%\Builds\iOS\Xcode" -logFile "%PROJ%\Builds\unity-ios-build.log"
if errorlevel 1 ( echo iOS export failed - see Builds\unity-ios-build.log & exit /b 1 )
echo Xcode project: %PROJ%\Builds\iOS\Xcode
exit /b 0
