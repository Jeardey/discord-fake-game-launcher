#import <Cocoa/Cocoa.h>

@interface DummyAppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate>
@property (strong) NSWindow *window;
@end

@implementation DummyAppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    NSArray *args = [[NSProcessInfo processInfo] arguments];
    NSString *displayName = (args.count > 1 && [args[1] length] > 0) ? args[1] : @"Game";

    // Set macOS process name without .exe so Discord detects the game and its official icon
    [[NSProcessInfo processInfo] setProcessName:displayName];

    NSRect frame = NSMakeRect(0, 0, 480, 200);
    NSUInteger style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable;

    self.window = [[NSWindow alloc] initWithContentRect:frame
                                              styleMask:style
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    [self.window setTitle:displayName];
    [self.window setDelegate:self];
    [self.window center];

    NSTextField *label = [[NSTextField alloc] initWithFrame:NSMakeRect(20, 75, 440, 40)];
    [label setStringValue:[NSString stringWithFormat:@"%@ (fake process for Discord)", displayName]];
    [label setAlignment:NSTextAlignmentCenter];
    [label setBezeled:NO];
    [label setDrawsBackground:NO];
    [label setEditable:NO];
    [label setSelectable:NO];
    [label setFont:[NSFont systemFontOfSize:14]];
    [[self.window contentView] addSubview:label];

    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (void)windowWillClose:(NSNotification *)notification {
    [NSApp terminate:nil];
}

@end

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        DummyAppDelegate *delegate = [[DummyAppDelegate alloc] init];
        [app setDelegate:delegate];
        [app run];
    }
    return 0;
}
