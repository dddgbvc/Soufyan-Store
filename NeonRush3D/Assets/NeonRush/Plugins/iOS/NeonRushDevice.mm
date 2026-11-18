// Native helpers for NEON RUSH (iOS only). No private APIs, no entitlements required.
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

extern "C" {

// 0 nominal, 1 fair, 2 serious, 3 critical
int NR_GetThermalState()
{
    return (int)[[NSProcessInfo processInfo] thermalState];
}

int NR_IsLowPowerMode()
{
    return [[NSProcessInfo processInfo] isLowPowerModeEnabled] ? 1 : 0;
}

// 120 on ProMotion displays (when CADisableMinimumFrameDurationOnPhone is set), 60 otherwise.
int NR_GetMaxFramesPerSecond()
{
    return (int)[[UIScreen mainScreen] maximumFramesPerSecond];
}

}
