#import "AppDelegate.h"

#import <CommonCrypto/CommonDigest.h>
#import <math.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTBundleURLProvider.h>
#import <SSZipArchive/SSZipArchive.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>
#if __has_include(<UniformTypeIdentifiers/UniformTypeIdentifiers.h>)
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#endif
#if __has_include(<WidgetKit/WidgetKit.h>)
#import <WidgetKit/WidgetKit.h>
#endif

static NSInteger const kBundleFormatVersion = 1;
static NSString * const kBundleManifestFileName = @"bundle-manifest.json";
static NSString * const kBundleCoreFileName = @"core.json";
static NSString * const kBundleRecurringPlansFileName = @"plans-recurring.json";
static NSString * const kBundleMode = @"directory-bundle";
static NSString * const kPeriodUnit = @"month";
static NSString * const kUndatedPeriodId = @"undated";
static NSString * const kLegacyStorageFileName = @"controler-data.json";
static NSString * const kAutoBackupSettingsDefaultsKey = @"controler.autoBackup.settings";
static NSString * const kAutoBackupStateDefaultsKey = @"controler.autoBackup.state";
static NSString * const kBridgeErrorDomain = @"ControlerBridge";
static NSString * const kReminderNotificationPrefix = @"order.reminder.";
static NSString * const kUiLanguageDefaultsKey = @"controler.ui.language";
static NSString * const kDefaultUiLanguage = @"zh-CN";
static NSString * const kStorageSelectionDefaultsKey = @"controler.storage.selection";
static NSString * const kPendingLaunchActionDefaultsKey = @"controler.pendingLaunchAction";
static NSString * const kStorageModeDefault = @"default";
static NSString * const kStorageModeFile = @"file";
static NSString * const kStorageModeDirectory = @"directory";
static NSString * const kStorageSwitchActionAdoptedExisting = @"adopted-existing";
static NSString * const kStorageSwitchActionSeededCurrent = @"seeded-current";
static NSString * const kStorageSwitchActionMigratedLegacy = @"migrated-legacy";
static NSString * const kControlerLaunchURLScheme = @"controlerapp";
static NSString * const kWidgetLaunchSource = @"ios-widget";
static NSString * const kNotificationLaunchSource = @"ios-notification";
static NSString * const kWidgetAppGroupIdentifier = @"group.com.controlerapp.shared";
static NSString * const kWidgetSnapshotFileName = @"widget-snapshot.json";

static NSString *ControlerTrimmedString(id value)
{
  if (![value isKindOfClass:[NSString class]]) return @"";
  return [(NSString *)value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
}

static NSString *ControlerOptionalTrimmedString(id value)
{
  NSString *trimmed = ControlerTrimmedString(value);
  return trimmed.length > 0 ? trimmed : nil;
}

static NSString *ControlerNormalizeUiLanguage(id value)
{
  NSString *normalized = [[ControlerTrimmedString(value) lowercaseString] copy];
  if ([normalized isEqualToString:@"en"] || [normalized isEqualToString:@"en-us"]) {
    return @"en-US";
  }
  return kDefaultUiLanguage;
}

static NSDictionary *ControlerEnsureDictionary(id value)
{
  return [value isKindOfClass:[NSDictionary class]] ? (NSDictionary *)value : @{};
}

static NSArray *ControlerEnsureArray(id value)
{
  return [value isKindOfClass:[NSArray class]] ? (NSArray *)value : @[];
}

static id ControlerJSONValue(id value)
{
  return value ?: [NSNull null];
}

static id ControlerDeepCopyJSON(id value)
{
  if (!value || value == [NSNull null] || [value isKindOfClass:[NSString class]] || [value isKindOfClass:[NSNumber class]]) return value;
  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:&error];
  if (error || !data) return value;
  id object = [NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingMutableContainers error:&error];
  return error || !object ? value : object;
}

static BOOL ControlerMatchesRegex(NSString *text, NSString *pattern)
{
  if (text.length == 0 || pattern.length == 0) return NO;
  NSError *error = nil;
  NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:pattern options:0 error:&error];
  return error || !regex ? NO : [regex numberOfMatchesInString:text options:0 range:NSMakeRange(0, text.length)] > 0;
}

static NSArray<NSString *> *ControlerPartitionedSections(void)
{
  static NSArray<NSString *> *sections = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{ sections = @[@"records", @"diaryEntries", @"dailyCheckins", @"checkins", @"plans"]; });
  return sections;
}

static NSArray<NSString *> *ControlerSharedArrayKeys(void)
{
  static NSArray<NSString *> *keys = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    keys = @[@"projects", @"records", @"plans", @"todos", @"checkinItems", @"dailyCheckins", @"checkins", @"diaryEntries", @"diaryCategories", @"customThemes"];
  });
  return keys;
}

static NSArray<NSString *> *ControlerCoreSectionKeys(void)
{
  static NSArray<NSString *> *keys = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    keys = @[@"projects", @"todos", @"checkinItems", @"yearlyGoals", @"diaryCategories", @"guideState", @"customThemes", @"builtInThemeOverrides", @"selectedTheme", @"createdAt", @"lastModified", @"storagePath", @"storageDirectory", @"userDataPath", @"documentsPath", @"syncMeta"];
  });
  return keys;
}

static NSDictionary *ControlerNormalizedGuideState(NSDictionary *guideState)
{
  NSDictionary *source = ControlerEnsureDictionary(guideState);
  NSArray *dismissedGuideDiaryEntryIds = ControlerEnsureArray(source[@"dismissedGuideDiaryEntryIds"]);
  if (dismissedGuideDiaryEntryIds.count == 0) {
    dismissedGuideDiaryEntryIds = ControlerEnsureArray(source[@"dismissedDiaryEntryIds"]);
  }
  NSInteger bundleVersion = [source[@"bundleVersion"] respondsToSelector:@selector(integerValue)]
    ? [source[@"bundleVersion"] integerValue]
    : 2;
  return @{
    @"bundleVersion": @(MAX(1, bundleVersion)),
    @"dismissedCardIds": ControlerDeepCopyJSON(ControlerEnsureArray(source[@"dismissedCardIds"])) ?: @[],
    @"dismissedGuideDiaryEntryIds": ControlerDeepCopyJSON(dismissedGuideDiaryEntryIds) ?: @[],
  };
}

static NSDictionary<NSString *, NSString *> *ControlerSectionDirectoryMap(void)
{
  static NSDictionary<NSString *, NSString *> *map = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    map = @{@"records": @"records", @"diaryEntries": @"diaryEntries", @"dailyCheckins": @"dailyCheckins", @"checkins": @"checkins", @"plans": @"plans"};
  });
  return map;
}

static NSSet<NSString *> *ControlerAutoBackupUnits(void)
{
  static NSSet<NSString *> *units = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{ units = [NSSet setWithArray:@[@"hour", @"day", @"week"]]; });
  return units;
}

static NSDictionary *ControlerNormalizeLaunchAction(id payload, NSString *fallbackSource)
{
  NSDictionary *source = ControlerEnsureDictionary(payload);
  NSString *page = ControlerOptionalTrimmedString(source[@"page"]);
  NSString *action = ControlerOptionalTrimmedString(source[@"action"]);
  if (page.length == 0 && action.length == 0) return nil;
  return @{
    @"hasAction": @YES,
    @"page": page ?: @"",
    @"action": action ?: @"",
    @"source": ControlerOptionalTrimmedString(source[@"source"]) ?: (fallbackSource ?: @"ios"),
    @"payload": ControlerDeepCopyJSON(ControlerEnsureDictionary(source[@"payload"])) ?: @{},
    @"kind": ControlerJSONValue(ControlerOptionalTrimmedString(source[@"kind"])),
  };
}

static NSDictionary *ControlerLaunchActionFromURL(NSURL *url)
{
  NSURLComponents *components = url ? [NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO] : nil;
  if (!components || ![[components.scheme lowercaseString] isEqualToString:kControlerLaunchURLScheme]) return nil;
  NSMutableDictionary *payload = [NSMutableDictionary dictionary];
  for (NSURLQueryItem *item in components.queryItems ?: @[]) {
    if (!item.name.length || !item.value.length) continue;
    payload[item.name] = item.value;
  }
  if (payload.count == 0 && components.host.length > 0) payload[@"action"] = components.host;
  if (!payload[@"source"]) payload[@"source"] = kWidgetLaunchSource;
  return ControlerNormalizeLaunchAction(payload, kWidgetLaunchSource);
}

static NSDictionary *ControlerLaunchActionFromNotificationUserInfo(NSDictionary *userInfo)
{
  return ControlerNormalizeLaunchAction(userInfo, kNotificationLaunchSource);
}

static void ControlerStorePendingLaunchAction(NSDictionary *payload)
{
  NSDictionary *normalized = ControlerNormalizeLaunchAction(payload, @"ios");
  if (!normalized) return;
  [[NSUserDefaults standardUserDefaults] setObject:normalized forKey:kPendingLaunchActionDefaultsKey];
}

static NSDictionary *ControlerConsumePendingLaunchAction(void)
{
  NSDictionary *payload = ControlerEnsureDictionary([[NSUserDefaults standardUserDefaults] dictionaryForKey:kPendingLaunchActionDefaultsKey]);
  [[NSUserDefaults standardUserDefaults] removeObjectForKey:kPendingLaunchActionDefaultsKey];
  return ControlerNormalizeLaunchAction(payload, @"ios");
}

@interface AppDelegate () <UNUserNotificationCenterDelegate>
@end

@interface ControlerBridge : NSObject <RCTBridgeModule, UIDocumentPickerDelegate>
@property (nonatomic, assign) BOOL autoBackupInFlight;
@property (nonatomic, copy) RCTPromiseResolveBlock pendingDocumentPickerResolve;
@property (nonatomic, copy) RCTPromiseRejectBlock pendingDocumentPickerReject;
@property (nonatomic, strong) NSDictionary *pendingDocumentPickerContext;
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"ControlerApp";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  if (@available(iOS 10.0, *)) {
    [UNUserNotificationCenter currentNotificationCenter].delegate = self;
  }
  NSDictionary *launchAction = ControlerLaunchActionFromURL(ControlerEnsureDictionary(launchOptions)[UIApplicationLaunchOptionsURLKey]);
  if (!launchAction) {
    launchAction = ControlerLaunchActionFromNotificationUserInfo(
      ControlerEnsureDictionary(ControlerEnsureDictionary(launchOptions)[UIApplicationLaunchOptionsLocalNotificationKey])
    );
  }
  if (launchAction) ControlerStorePendingLaunchAction(launchAction);

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options
{
  NSDictionary *launchAction = ControlerLaunchActionFromURL(url);
  if (launchAction) ControlerStorePendingLaunchAction(launchAction);
  return [super application:application openURL:url options:options] || launchAction != nil;
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler API_AVAILABLE(ios(10.0))
{
  if (@available(iOS 14.0, *)) {
    completionHandler(UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionSound | UNNotificationPresentationOptionBadge);
    return;
  }
  completionHandler(UNNotificationPresentationOptionAlert | UNNotificationPresentationOptionSound | UNNotificationPresentationOptionBadge);
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler API_AVAILABLE(ios(10.0))
{
  NSDictionary *launchAction = ControlerLaunchActionFromNotificationUserInfo(response.notification.request.content.userInfo);
  if (launchAction) ControlerStorePendingLaunchAction(launchAction);
  completionHandler();
}

@end

@implementation ControlerBridge

RCT_EXPORT_MODULE(ControlerBridge);

- (NSError *)bridgeErrorWithDescription:(NSString *)description code:(NSInteger)code
{
  return [NSError errorWithDomain:kBridgeErrorDomain code:code userInfo:@{NSLocalizedDescriptionKey: ControlerOptionalTrimmedString(description) ?: @"操作失败。"}];
}

- (NSFileManager *)fileManager { return [NSFileManager defaultManager]; }

- (NSString *)documentsPath
{
  NSArray<NSString *> *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  return paths.firstObject ?: NSTemporaryDirectory();
}

- (NSString *)defaultBundleDirectoryPath { return [[self documentsPath] stringByAppendingPathComponent:@"Order/app_data"]; }
- (NSString *)defaultManifestPath { return [[self defaultBundleDirectoryPath] stringByAppendingPathComponent:kBundleManifestFileName]; }
- (NSString *)storedUiLanguage { return ControlerNormalizeUiLanguage([[NSUserDefaults standardUserDefaults] stringForKey:kUiLanguageDefaultsKey]); }
- (NSString *)persistUiLanguage:(NSString *)language
{
  NSString *normalized = ControlerNormalizeUiLanguage(language);
  [[NSUserDefaults standardUserDefaults] setObject:normalized forKey:kUiLanguageDefaultsKey];
  return normalized;
}

- (NSDictionary *)storedStorageSelection
{
  NSDictionary *raw = ControlerEnsureDictionary([[NSUserDefaults standardUserDefaults] dictionaryForKey:kStorageSelectionDefaultsKey]);
  NSString *mode = ControlerOptionalTrimmedString(raw[@"mode"]);
  if (![mode isEqualToString:kStorageModeFile] && ![mode isEqualToString:kStorageModeDirectory]) mode = kStorageModeDefault;
  NSMutableDictionary *selection = [@{@"mode": mode} mutableCopy];
  if ([raw[@"bookmark"] isKindOfClass:[NSData class]]) selection[@"bookmark"] = raw[@"bookmark"];
  if (ControlerOptionalTrimmedString(raw[@"path"])) selection[@"path"] = ControlerOptionalTrimmedString(raw[@"path"]);
  if (ControlerOptionalTrimmedString(raw[@"parentPath"])) selection[@"parentPath"] = ControlerOptionalTrimmedString(raw[@"parentPath"]);
  if (ControlerOptionalTrimmedString(raw[@"displayName"])) selection[@"displayName"] = ControlerOptionalTrimmedString(raw[@"displayName"]);
  return selection;
}

- (void)restoreStoredStorageSelection:(NSDictionary *)selection
{
  NSDictionary *normalized = ControlerEnsureDictionary(selection);
  NSString *mode = ControlerOptionalTrimmedString(normalized[@"mode"]);
  if (normalized.count == 0 || mode.length == 0 || [mode isEqualToString:kStorageModeDefault]) {
    [[NSUserDefaults standardUserDefaults] removeObjectForKey:kStorageSelectionDefaultsKey];
    return;
  }
  [[NSUserDefaults standardUserDefaults] setObject:normalized forKey:kStorageSelectionDefaultsKey];
}

- (void)saveStoredStorageSelectionFromURL:(NSURL *)url mode:(NSString *)mode displayName:(NSString *)displayName error:(NSError **)error
{
  NSString *normalizedMode = ControlerOptionalTrimmedString(mode);
  if (url == nil || !([normalizedMode isEqualToString:kStorageModeFile] || [normalizedMode isEqualToString:kStorageModeDirectory])) {
    [self restoreStoredStorageSelection:@{}];
    return;
  }
  NSData *bookmark = [url bookmarkDataWithOptions:NSURLBookmarkCreationWithSecurityScope includingResourceValuesForKeys:nil relativeToURL:nil error:error];
  if (!bookmark) return;
  NSString *resolvedPath = url.path ?: @"";
  NSString *parentPath = [normalizedMode isEqualToString:kStorageModeDirectory] ? resolvedPath : (resolvedPath.stringByDeletingLastPathComponent ?: @"");
  [self restoreStoredStorageSelection:@{
    @"mode": normalizedMode,
    @"bookmark": bookmark,
    @"path": resolvedPath,
    @"parentPath": parentPath ?: @"",
    @"displayName": ControlerOptionalTrimmedString(displayName) ?: (url.lastPathComponent ?: @""),
  }];
}

- (NSDictionary *)resolvedStorageSelectionWithError:(NSError **)error
{
  NSDictionary *stored = [self storedStorageSelection];
  NSString *mode = ControlerOptionalTrimmedString(stored[@"mode"]);
  if (![mode isEqualToString:kStorageModeFile] && ![mode isEqualToString:kStorageModeDirectory]) {
    return @{
      @"mode": kStorageModeDefault,
      @"path": [self defaultBundleDirectoryPath],
      @"parentPath": [self defaultBundleDirectoryPath],
      @"displayName": @"Order/app_data",
      @"isCustom": @NO,
      @"didAccess": @NO,
    };
  }

  NSData *bookmark = [stored[@"bookmark"] isKindOfClass:[NSData class]] ? stored[@"bookmark"] : nil;
  if (!bookmark) {
    [self restoreStoredStorageSelection:@{}];
    return [self resolvedStorageSelectionWithError:error];
  }

  BOOL bookmarkIsStale = NO;
  NSURL *resolvedURL = [NSURL URLByResolvingBookmarkData:bookmark options:NSURLBookmarkResolutionWithSecurityScope relativeToURL:nil bookmarkDataIsStale:&bookmarkIsStale error:error];
  if (!resolvedURL) return nil;
  BOOL didAccess = [resolvedURL startAccessingSecurityScopedResource];
  NSString *resolvedPath = resolvedURL.path ?: ControlerOptionalTrimmedString(stored[@"path"]) ?: @"";
  NSString *displayName = ControlerOptionalTrimmedString(stored[@"displayName"]) ?: (resolvedURL.lastPathComponent ?: @"");
  NSString *parentPath = [mode isEqualToString:kStorageModeDirectory] ? resolvedPath : (resolvedPath.stringByDeletingLastPathComponent ?: ControlerOptionalTrimmedString(stored[@"parentPath"]) ?: @"");
  if (bookmarkIsStale) {
    NSError *refreshError = nil;
    [self saveStoredStorageSelectionFromURL:resolvedURL mode:mode displayName:displayName error:&refreshError];
    if (refreshError) NSLog(@"[ControlerBridge] 刷新 iOS storage bookmark 失败: %@", refreshError.localizedDescription);
  }
  return @{
    @"mode": mode,
    @"url": resolvedURL,
    @"path": resolvedPath,
    @"parentPath": parentPath ?: @"",
    @"displayName": displayName ?: @"",
    @"isCustom": @YES,
    @"didAccess": @(didAccess),
  };
}

- (void)releaseStorageSelectionAccess:(NSDictionary *)selection
{
  if (![selection[@"didAccess"] boolValue]) return;
  NSURL *resolvedURL = selection[@"url"];
  if ([resolvedURL isKindOfClass:[NSURL class]]) [resolvedURL stopAccessingSecurityScopedResource];
}

- (BOOL)isFileStorageMode
{
  return [[ControlerOptionalTrimmedString([self storedStorageSelection][@"mode"]) lowercaseString] isEqualToString:kStorageModeFile];
}

- (BOOL)usesBundleStorageMode { return ![self isFileStorageMode]; }

- (NSString *)bundleDirectoryPathForSelection:(NSDictionary *)selection
{
  NSString *mode = ControlerOptionalTrimmedString(selection[@"mode"]);
  if ([mode isEqualToString:kStorageModeDirectory]) {
    NSString *customPath = ControlerOptionalTrimmedString(selection[@"path"]);
    if (customPath.length > 0) return customPath;
  }
  return [self defaultBundleDirectoryPath];
}

- (NSString *)storageDirectoryPath
{
  NSDictionary *selection = [self storedStorageSelection];
  NSString *mode = ControlerOptionalTrimmedString(selection[@"mode"]);
  if ([mode isEqualToString:kStorageModeDirectory]) {
    NSString *customPath = ControlerOptionalTrimmedString(selection[@"path"]);
    if (customPath.length > 0) return customPath;
  }
  if ([mode isEqualToString:kStorageModeFile]) {
    NSString *parentPath = ControlerOptionalTrimmedString(selection[@"parentPath"]);
    if (parentPath.length > 0) return parentPath;
  }
  return [self defaultBundleDirectoryPath];
}

- (NSString *)manifestPath
{
  if ([self isFileStorageMode]) {
    NSString *filePath = ControlerOptionalTrimmedString([self storedStorageSelection][@"path"]);
    return filePath.length > 0 ? filePath : [self defaultManifestPath];
  }
  return [[self storageDirectoryPath] stringByAppendingPathComponent:kBundleManifestFileName];
}

- (NSString *)corePath { return [[self bundleDirectoryPathForSelection:[self storedStorageSelection]] stringByAppendingPathComponent:kBundleCoreFileName]; }
- (NSString *)recurringPlansPath { return [[self bundleDirectoryPathForSelection:[self storedStorageSelection]] stringByAppendingPathComponent:kBundleRecurringPlansFileName]; }
- (NSString *)legacyStorageFilePath
{
  if ([self isFileStorageMode]) return [self manifestPath];
  return [[self bundleDirectoryPathForSelection:[self storedStorageSelection]] stringByAppendingPathComponent:kLegacyStorageFileName];
}
- (NSString *)backupDirectoryPath
{
  NSDictionary *selection = [self storedStorageSelection];
  NSString *mode = ControlerOptionalTrimmedString(selection[@"mode"]);
  NSString *root = [mode isEqualToString:kStorageModeDirectory]
    ? [self bundleDirectoryPathForSelection:selection]
    : [self defaultBundleDirectoryPath];
  return [root stringByAppendingPathComponent:@"backups"];
}

- (NSDictionary *)bundlePathsForSelection:(NSDictionary *)selection
{
  NSString *root = [self bundleDirectoryPathForSelection:selection];
  return @{
    @"root": root,
    @"manifest": [root stringByAppendingPathComponent:kBundleManifestFileName],
    @"core": [root stringByAppendingPathComponent:kBundleCoreFileName],
    @"recurring": [root stringByAppendingPathComponent:kBundleRecurringPlansFileName],
    @"legacy": [root stringByAppendingPathComponent:kLegacyStorageFileName],
  };
}

- (NSString *)isoStringFromDate:(NSDate *)date
{
  if (!date) return nil;
  NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
  formatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
  formatter.timeZone = [NSTimeZone timeZoneWithAbbreviation:@"UTC"];
  formatter.dateFormat = @"yyyy-MM-dd'T'HH:mm:ss.SSSXXX";
  return [formatter stringFromDate:date];
}

- (NSString *)isoNow { return [self isoStringFromDate:[NSDate date]]; }

- (NSString *)timestampTagFromDate:(NSDate *)date
{
  NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
  formatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
  formatter.timeZone = [NSTimeZone localTimeZone];
  formatter.dateFormat = @"yyyyMMdd-HHmmss";
  return [formatter stringFromDate:(date ?: [NSDate date])];
}

- (NSDate *)dateFromValue:(id)value
{
  if ([value isKindOfClass:[NSDate class]]) return (NSDate *)value;
  if ([value respondsToSelector:@selector(doubleValue)] && ![value isKindOfClass:[NSString class]]) {
    double numericValue = [value doubleValue];
    if (!isfinite(numericValue) || numericValue <= 0) return nil;
    return [NSDate dateWithTimeIntervalSince1970:(numericValue > 1000000000000.0 ? numericValue / 1000.0 : numericValue)];
  }
  NSString *text = ControlerTrimmedString(value);
  if (text.length == 0) return nil;
  if (ControlerMatchesRegex(text, @"^\\d{4}-\\d{2}-\\d{2}$")) {
    NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
    formatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    formatter.timeZone = [NSTimeZone localTimeZone];
    formatter.dateFormat = @"yyyy-MM-dd";
    return [formatter dateFromString:text];
  }
  NSISO8601DateFormatter *withFraction = [[NSISO8601DateFormatter alloc] init];
  withFraction.formatOptions = NSISO8601DateFormatWithInternetDateTime | NSISO8601DateFormatWithFractionalSeconds;
  NSDate *parsed = [withFraction dateFromString:text];
  if (parsed) return parsed;
  NSISO8601DateFormatter *formatter = [[NSISO8601DateFormatter alloc] init];
  formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime;
  parsed = [formatter dateFromString:text];
  if (parsed) return parsed;
  NSDateFormatter *fallback = [[NSDateFormatter alloc] init];
  fallback.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
  fallback.timeZone = [NSTimeZone localTimeZone];
  fallback.dateFormat = @"yyyy-MM-dd'T'HH:mm:ss.SSSZZZZZ";
  parsed = [fallback dateFromString:text];
  if (parsed) return parsed;
  fallback.dateFormat = @"yyyy-MM-dd'T'HH:mm:ssZZZZZ";
  return [fallback dateFromString:text];
}

- (NSString *)dateKeyFromDate:(NSDate *)date
{
  if (!date) return nil;
  NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
  formatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
  formatter.timeZone = [NSTimeZone localTimeZone];
  formatter.dateFormat = @"yyyy-MM-dd";
  return [formatter stringFromDate:date];
}

- (NSString *)dateKeyFromValue:(id)value { return [self dateKeyFromDate:[self dateFromValue:value]]; }

- (NSString *)periodIdFromDate:(NSDate *)date
{
  if (!date) return nil;
  NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
  formatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
  formatter.timeZone = [NSTimeZone localTimeZone];
  formatter.dateFormat = @"yyyy-MM";
  return [formatter stringFromDate:date];
}

- (NSString *)normalizedPeriodId:(id)value
{
  NSString *text = ControlerTrimmedString(value);
  if (text.length == 0) return @"";
  if ([text isEqualToString:kUndatedPeriodId]) return text;
  return ControlerMatchesRegex(text, @"^\\d{4}-\\d{2}$") ? text : @"";
}

- (BOOL)isRecurringPlan:(id)itemValue
{
  NSString *repeatValue = [[ControlerTrimmedString(ControlerEnsureDictionary(itemValue)[@"repeat"]) lowercaseString] copy];
  return repeatValue.length > 0 && ![repeatValue isEqualToString:@"none"];
}

- (NSDate *)sectionDateForSection:(NSString *)section item:(NSDictionary *)item
{
  if ([section isEqualToString:@"records"]) return [self dateFromValue:item[@"endTime"] ?: item[@"timestamp"] ?: item[@"startTime"]];
  if ([section isEqualToString:@"plans"]) return [self dateFromValue:item[@"date"]];
  if ([section isEqualToString:@"diaryEntries"]) return [self dateFromValue:item[@"date"] ?: item[@"updatedAt"]];
  if ([section isEqualToString:@"dailyCheckins"]) return [self dateFromValue:item[@"date"]];
  if ([section isEqualToString:@"checkins"]) return [self dateFromValue:item[@"updatedAt"] ?: item[@"time"]];
  return nil;
}

- (NSString *)periodIdForSection:(NSString *)section item:(NSDictionary *)item
{
  if ([section isEqualToString:@"plans"] && [self isRecurringPlan:item]) return @"";
  return [self periodIdFromDate:[self sectionDateForSection:section item:item]] ?: kUndatedPeriodId;
}

- (NSString *)serializeObject:(id)object
{
  id safeObject = object ?: @{};
  if (![NSJSONSerialization isValidJSONObject:safeObject]) {
    if ([safeObject isKindOfClass:[NSString class]]) return (NSString *)safeObject;
    safeObject = @{};
  }
  NSData *data = [NSJSONSerialization dataWithJSONObject:safeObject options:0 error:nil];
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"{}";
}

- (id)jsonObjectFromFile:(NSString *)path fallback:(id)fallback
{
  if (path.length == 0 || ![[self fileManager] fileExistsAtPath:path]) return fallback;
  NSData *data = [NSData dataWithContentsOfFile:path];
  if (data.length == 0) return fallback;
  NSError *error = nil;
  id object = [NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingMutableContainers error:&error];
  return error || !object ? fallback : object;
}

- (BOOL)ensureDirectoryAtPath:(NSString *)path error:(NSError **)error
{
  if (path.length == 0) {
    if (error) *error = [self bridgeErrorWithDescription:@"目录路径不能为空。" code:1001];
    return NO;
  }
  return [[self fileManager] createDirectoryAtPath:path withIntermediateDirectories:YES attributes:nil error:error];
}

- (BOOL)writeJsonObject:(id)object toFile:(NSString *)path error:(NSError **)error
{
  NSError *directoryError = nil;
  if (![self ensureDirectoryAtPath:[path stringByDeletingLastPathComponent] error:&directoryError]) {
    if (error) *error = directoryError;
    return NO;
  }
  NSData *data = [NSJSONSerialization dataWithJSONObject:(object ?: @{}) options:NSJSONWritingPrettyPrinted error:error];
  return data ? [data writeToFile:path options:NSDataWritingAtomic error:error] : NO;
}

- (NSDictionary *)defaultSyncMetaFromSource:(NSDictionary *)source
{
  NSDictionary *input = ControlerEnsureDictionary(source);
  return @{
    @"mode": kBundleMode,
    @"fileName": kBundleManifestFileName,
    @"autoSyncEnabled": @YES,
    @"lastSavedAt": ControlerJSONValue(ControlerOptionalTrimmedString(input[@"lastSavedAt"])),
    @"lastTriggeredAt": ControlerJSONValue(ControlerOptionalTrimmedString(input[@"lastTriggeredAt"])),
    @"lastFlushStartedAt": ControlerJSONValue(ControlerOptionalTrimmedString(input[@"lastFlushStartedAt"])),
    @"lastFlushCompletedAt": ControlerJSONValue(ControlerOptionalTrimmedString(input[@"lastFlushCompletedAt"])),
    @"pendingWriteCount": @(MAX(0, [input[@"pendingWriteCount"] integerValue])),
  };
}

- (NSDictionary *)normalizedState:(NSDictionary *)state touchModified:(BOOL)touchModified touchSyncSave:(BOOL)touchSyncSave
{
  NSDictionary *source = ControlerEnsureDictionary(state);
  NSString *now = [self isoNow];
  NSMutableDictionary *next = [NSMutableDictionary dictionary];
  for (NSString *key in ControlerSharedArrayKeys()) next[key] = ControlerDeepCopyJSON(ControlerEnsureArray(source[key])) ?: @[];
  next[@"yearlyGoals"] = ControlerDeepCopyJSON(ControlerEnsureDictionary(source[@"yearlyGoals"])) ?: @{};
  next[@"guideState"] = ControlerNormalizedGuideState(ControlerEnsureDictionary(source[@"guideState"]));
  next[@"builtInThemeOverrides"] = ControlerDeepCopyJSON(ControlerEnsureDictionary(source[@"builtInThemeOverrides"])) ?: @{};
  next[@"selectedTheme"] = ControlerOptionalTrimmedString(source[@"selectedTheme"]) ?: @"default";
  next[@"createdAt"] = ControlerOptionalTrimmedString(source[@"createdAt"]) ?: now;
  next[@"lastModified"] = touchModified || !ControlerOptionalTrimmedString(source[@"lastModified"]) ? now : source[@"lastModified"];
  next[@"storagePath"] = [self manifestPath];
  next[@"storageDirectory"] = [self storageDirectoryPath];
  next[@"userDataPath"] = [self documentsPath];
  next[@"documentsPath"] = [self documentsPath];
  NSMutableDictionary *syncMeta = [[self defaultSyncMetaFromSource:ControlerEnsureDictionary(source[@"syncMeta"])] mutableCopy];
  if (touchSyncSave) {
    syncMeta[@"lastSavedAt"] = now;
    syncMeta[@"lastTriggeredAt"] = now;
  }
  next[@"syncMeta"] = syncMeta;
  return next;
}

- (NSDictionary *)validatedStorageStateFromObject:(id)object error:(NSError **)error
{
  if (![object isKindOfClass:[NSDictionary class]]) {
    if (error) *error = [self bridgeErrorWithDescription:@"无效的 iOS 存储数据格式。" code:1002];
    return nil;
  }
  NSDictionary *state = (NSDictionary *)object;
  if (![state[@"projects"] isKindOfClass:[NSArray class]] || ![state[@"records"] isKindOfClass:[NSArray class]]) {
    if (error) *error = [self bridgeErrorWithDescription:@"缺少必需的 iOS 存储字段。" code:1003];
    return nil;
  }
  return state;
}

- (NSString *)relativePartitionPathForSection:(NSString *)section periodId:(NSString *)periodId
{
  NSString *directory = ControlerSectionDirectoryMap()[section];
  NSString *normalizedPeriodId = [self normalizedPeriodId:periodId];
  if (directory.length == 0 || normalizedPeriodId.length == 0) return nil;
  if ([normalizedPeriodId isEqualToString:kUndatedPeriodId]) return [NSString stringWithFormat:@"%@/undated.json", directory];
  return [NSString stringWithFormat:@"%@/%@/%@.json", directory, [normalizedPeriodId substringToIndex:4], normalizedPeriodId];
}

- (NSArray *)sortedItems:(NSArray *)items forSection:(NSString *)section
{
  NSArray *source = ControlerEnsureArray(items);
  NSString *sectionName = ControlerTrimmedString(section);
  return [source sortedArrayUsingComparator:^NSComparisonResult(id leftValue, id rightValue) {
    NSDictionary *left = ControlerEnsureDictionary(leftValue), *right = ControlerEnsureDictionary(rightValue);
    NSTimeInterval leftTime = [[self sectionDateForSection:sectionName item:left] timeIntervalSince1970];
    NSTimeInterval rightTime = [[self sectionDateForSection:sectionName item:right] timeIntervalSince1970];
    if (leftTime < rightTime) return NSOrderedAscending;
    if (leftTime > rightTime) return NSOrderedDescending;
    if ([sectionName isEqualToString:@"plans"]) {
      NSComparisonResult startCompare = [ControlerTrimmedString(left[@"startTime"]) compare:ControlerTrimmedString(right[@"startTime"])];
      if (startCompare != NSOrderedSame) return startCompare;
    }
    return [[self serializeObject:left] compare:[self serializeObject:right]];
  }];
}

- (NSDictionary *)createPartitionEnvelopeForSection:(NSString *)section periodId:(NSString *)periodId items:(NSArray *)items fingerprint:(NSString *)fingerprint
{
  NSString *resolvedPeriodId = [self normalizedPeriodId:periodId];
  if (resolvedPeriodId.length == 0) resolvedPeriodId = kUndatedPeriodId;
  NSArray *sorted = [self sortedItems:items forSection:section];
  NSString *minDate = sorted.count ? [self dateKeyFromDate:[self sectionDateForSection:section item:ControlerEnsureDictionary(sorted.firstObject)]] : nil;
  NSString *maxDate = sorted.count ? [self dateKeyFromDate:[self sectionDateForSection:section item:ControlerEnsureDictionary(sorted.lastObject)]] : nil;
  NSString *resolvedFingerprint = ControlerOptionalTrimmedString(fingerprint);
  if (!resolvedFingerprint) resolvedFingerprint = [NSString stringWithFormat:@"%@:%@:%lu:%@:%@:%lu", section, resolvedPeriodId, (unsigned long)sorted.count, minDate ?: @"", maxDate ?: @"", (unsigned long)[[self serializeObject:sorted] lengthOfBytesUsingEncoding:NSUTF8StringEncoding]];
  return @{@"formatVersion": @(kBundleFormatVersion), @"section": section, @"periodUnit": kPeriodUnit, @"periodId": resolvedPeriodId, @"count": @(sorted.count), @"minDate": ControlerJSONValue(minDate), @"maxDate": ControlerJSONValue(maxDate), @"fingerprint": resolvedFingerprint, @"items": ControlerDeepCopyJSON(sorted) ?: @[]};
}

- (NSDictionary *)normalizedManifest:(NSDictionary *)rawManifest
{
  NSDictionary *source = ControlerEnsureDictionary(rawManifest);
  if (source.count == 0) return nil;
  NSDictionary *sourceSections = ControlerEnsureDictionary(source[@"sections"]);
  NSMutableDictionary *sections = [NSMutableDictionary dictionary];
  sections[@"core"] = @{@"file": ControlerOptionalTrimmedString(ControlerEnsureDictionary(sourceSections[@"core"])[@"file"]) ?: kBundleCoreFileName};
  sections[@"plansRecurring"] = @{@"file": ControlerOptionalTrimmedString(ControlerEnsureDictionary(sourceSections[@"plansRecurring"])[@"file"]) ?: kBundleRecurringPlansFileName, @"count": @(MAX(0, [ControlerEnsureDictionary(sourceSections[@"plansRecurring"])[@"count"] integerValue]))};
  for (NSString *section in ControlerPartitionedSections()) {
    NSMutableArray *partitions = [NSMutableArray array];
    for (id partitionValue in ControlerEnsureArray(ControlerEnsureDictionary(sourceSections[section])[@"partitions"])) {
      NSDictionary *partition = ControlerEnsureDictionary(partitionValue);
      NSString *periodId = [self normalizedPeriodId:partition[@"periodId"]], *file = ControlerOptionalTrimmedString(partition[@"file"]);
      if (periodId.length == 0 || file.length == 0) continue;
      [partitions addObject:@{@"periodId": periodId, @"file": file, @"count": @(MAX(0, [partition[@"count"] integerValue])), @"minDate": ControlerJSONValue(ControlerOptionalTrimmedString(partition[@"minDate"])), @"maxDate": ControlerJSONValue(ControlerOptionalTrimmedString(partition[@"maxDate"])), @"fingerprint": ControlerOptionalTrimmedString(partition[@"fingerprint"]) ?: @""}];
    }
    [partitions sortUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) { return [ControlerTrimmedString(left[@"periodId"]) compare:ControlerTrimmedString(right[@"periodId"])]; }];
    sections[section] = @{@"periodUnit": kPeriodUnit, @"partitions": partitions};
  }
  return @{@"formatVersion": @(kBundleFormatVersion), @"bundleMode": kBundleMode, @"createdAt": ControlerOptionalTrimmedString(source[@"createdAt"]) ?: [self isoNow], @"lastModified": ControlerOptionalTrimmedString(source[@"lastModified"]) ?: ControlerOptionalTrimmedString(source[@"createdAt"]) ?: [self isoNow], @"sections": sections, @"legacyBackups": ControlerDeepCopyJSON(ControlerEnsureArray(source[@"legacyBackups"])) ?: @[]};
}

- (NSDictionary *)sectionManifestForSection:(NSString *)section partitionBuckets:(NSDictionary *)partitionBuckets
{
  NSMutableArray *partitions = [NSMutableArray array];
  for (NSString *periodId in [[ControlerEnsureDictionary(partitionBuckets) allKeys] sortedArrayUsingSelector:@selector(compare:)]) {
    NSArray *items = ControlerEnsureArray(ControlerEnsureDictionary(partitionBuckets)[periodId]);
    if (items.count == 0) continue;
    NSDictionary *envelope = [self createPartitionEnvelopeForSection:section periodId:periodId items:items fingerprint:nil];
    NSString *relativePath = [self relativePartitionPathForSection:section periodId:envelope[@"periodId"]];
    if (relativePath.length == 0) continue;
    [partitions addObject:@{@"periodId": envelope[@"periodId"], @"file": relativePath, @"count": envelope[@"count"], @"minDate": envelope[@"minDate"], @"maxDate": envelope[@"maxDate"], @"fingerprint": envelope[@"fingerprint"]}];
  }
  return @{@"periodUnit": kPeriodUnit, @"partitions": partitions};
}

- (NSDictionary *)splitStateIntoBundle:(NSDictionary *)state legacyBackups:(NSArray *)legacyBackups touchModified:(BOOL)touchModified touchSyncSave:(BOOL)touchSyncSave
{
  NSDictionary *normalized = [self normalizedState:state touchModified:touchModified touchSyncSave:touchSyncSave];
  NSMutableDictionary *core = [NSMutableDictionary dictionary];
  for (NSString *key in ControlerCoreSectionKeys()) if (normalized[key]) core[key] = ControlerDeepCopyJSON(normalized[key]) ?: normalized[key];
  NSMutableArray *recurringPlans = [NSMutableArray array];
  NSMutableDictionary *partitionMap = [NSMutableDictionary dictionary];
  for (NSString *section in ControlerPartitionedSections()) {
    NSMutableDictionary *sectionBuckets = [NSMutableDictionary dictionary];
    for (id itemValue in ControlerEnsureArray(normalized[section])) {
      NSDictionary *item = ControlerEnsureDictionary(itemValue);
      if ([section isEqualToString:@"plans"] && [self isRecurringPlan:item]) {
        [recurringPlans addObject:ControlerDeepCopyJSON(itemValue) ?: itemValue];
        continue;
      }
      NSString *periodId = [self periodIdForSection:section item:item];
      if (periodId.length == 0) periodId = kUndatedPeriodId;
      if (!sectionBuckets[periodId]) sectionBuckets[periodId] = [NSMutableArray array];
      [sectionBuckets[periodId] addObject:ControlerDeepCopyJSON(itemValue) ?: itemValue];
    }
    partitionMap[section] = sectionBuckets;
  }
  NSMutableDictionary *sections = [NSMutableDictionary dictionary];
  sections[@"core"] = @{@"file": kBundleCoreFileName};
  sections[@"plansRecurring"] = @{@"file": kBundleRecurringPlansFileName, @"count": @(recurringPlans.count)};
  for (NSString *section in ControlerPartitionedSections()) sections[section] = [self sectionManifestForSection:section partitionBuckets:partitionMap[section]];
  return @{@"manifest": @{@"formatVersion": @(kBundleFormatVersion), @"bundleMode": kBundleMode, @"createdAt": normalized[@"createdAt"] ?: [self isoNow], @"lastModified": normalized[@"lastModified"] ?: normalized[@"createdAt"] ?: [self isoNow], @"sections": sections, @"legacyBackups": ControlerDeepCopyJSON(ControlerEnsureArray(legacyBackups)) ?: @[]}, @"core": core, @"recurringPlans": recurringPlans, @"partitionMap": partitionMap};
}

- (NSDictionary *)buildLegacyStateFromBundlePayload:(NSDictionary *)payload
{
  NSDictionary *manifest = [self normalizedManifest:ControlerEnsureDictionary(payload[@"manifest"])] ?: @{};
  NSDictionary *core = ControlerEnsureDictionary(payload[@"core"]), *partitionMap = ControlerEnsureDictionary(payload[@"partitionMap"]);
  NSMutableDictionary *state = [[self normalizedState:@{} touchModified:NO touchSyncSave:NO] mutableCopy];
  for (NSString *key in ControlerCoreSectionKeys()) if (core[key]) state[key] = ControlerDeepCopyJSON(core[key]) ?: core[key];
  for (NSString *section in ControlerPartitionedSections()) {
    NSMutableArray *items = [NSMutableArray array];
    NSDictionary *sectionBuckets = ControlerEnsureDictionary(partitionMap[section]);
    for (NSString *periodId in [[sectionBuckets allKeys] sortedArrayUsingSelector:@selector(compare:)]) [items addObjectsFromArray:ControlerEnsureArray(sectionBuckets[periodId])];
    state[section] = [self sortedItems:items forSection:section];
  }
  state[@"plans"] = [self sortedItems:[ControlerEnsureArray(state[@"plans"]) arrayByAddingObjectsFromArray:ControlerEnsureArray(payload[@"recurringPlans"])] forSection:@"plans"];
  state[@"createdAt"] = ControlerOptionalTrimmedString(state[@"createdAt"]) ?: manifest[@"createdAt"] ?: [self isoNow];
  state[@"lastModified"] = ControlerOptionalTrimmedString(state[@"lastModified"]) ?: manifest[@"lastModified"] ?: state[@"createdAt"];
  return [self normalizedState:state touchModified:NO touchSyncSave:NO];
}

- (NSArray *)partitionItemsForState:(NSDictionary *)state section:(NSString *)section periodId:(NSString *)periodId
{
  NSString *resolvedPeriodId = [self normalizedPeriodId:periodId];
  if (resolvedPeriodId.length == 0) resolvedPeriodId = kUndatedPeriodId;
  NSMutableArray *items = [NSMutableArray array];
  for (id itemValue in ControlerEnsureArray(ControlerEnsureDictionary(state)[section])) {
    NSDictionary *item = ControlerEnsureDictionary(itemValue);
    if ([section isEqualToString:@"plans"] && [self isRecurringPlan:item]) continue;
    NSString *itemPeriodId = [self periodIdForSection:section item:item];
    if (itemPeriodId.length == 0) itemPeriodId = kUndatedPeriodId;
    if ([itemPeriodId isEqualToString:resolvedPeriodId]) [items addObject:ControlerDeepCopyJSON(itemValue) ?: itemValue];
  }
  return [self sortedItems:items forSection:section];
}

- (NSDictionary *)readFileStorageStateForSelection:(NSDictionary *)selection error:(NSError **)error
{
  NSString *path = ControlerOptionalTrimmedString(selection[@"path"]);
  if (path.length == 0) {
    if (error) *error = [self bridgeErrorWithDescription:@"当前未绑定外部 JSON 存储文件。" code:1005];
    return nil;
  }
  if (![[self fileManager] fileExistsAtPath:path]) return nil;
  NSData *data = [NSData dataWithContentsOfFile:path];
  if (data.length == 0) return nil;
  NSError *parseError = nil;
  id object = [NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingMutableContainers error:&parseError];
  if (parseError) {
    if (error) *error = parseError;
    return nil;
  }
  NSDictionary *validated = [self validatedStorageStateFromObject:object error:error];
  return validated ? [self normalizedState:validated touchModified:NO touchSyncSave:NO] : nil;
}

- (NSDictionary *)readManifest
{
  if ([self isFileStorageMode]) {
    NSError *selectionError = nil;
    NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
    if (!selection) return nil;
    NSDictionary *state = [self readFileStorageStateForSelection:selection error:nil];
    [self releaseStorageSelectionAccess:selection];
    if (!state) return nil;
    return [self normalizedManifest:[self splitStateIntoBundle:state legacyBackups:nil touchModified:NO touchSyncSave:NO][@"manifest"]];
  }
  NSError *selectionError = nil;
  NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
  if (!selection) return nil;
  NSDictionary *paths = [self bundlePathsForSelection:selection];
  NSDictionary *manifest = [self normalizedManifest:[self jsonObjectFromFile:paths[@"manifest"] fallback:nil]];
  [self releaseStorageSelectionAccess:selection];
  return manifest;
}

- (NSDictionary *)readCoreStateDictionary
{
  if ([self isFileStorageMode]) {
    NSDictionary *state = [self loadBundleState];
    NSMutableDictionary *core = [NSMutableDictionary dictionary];
    for (NSString *key in ControlerCoreSectionKeys()) if (state[key]) core[key] = ControlerDeepCopyJSON(state[key]) ?: state[key];
    return core;
  }
  NSError *selectionError = nil;
  NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
  if (!selection) return @{};
  NSDictionary *paths = [self bundlePathsForSelection:selection];
  NSDictionary *core = ControlerEnsureDictionary([self jsonObjectFromFile:paths[@"core"] fallback:@{}]);
  [self releaseStorageSelectionAccess:selection];
  return core;
}

- (NSArray *)readRecurringPlansArray
{
  if ([self isFileStorageMode]) {
    NSMutableArray *recurringPlans = [NSMutableArray array];
    for (id itemValue in ControlerEnsureArray([self loadBundleState][@"plans"])) if ([self isRecurringPlan:itemValue]) [recurringPlans addObject:ControlerDeepCopyJSON(itemValue) ?: itemValue];
    return recurringPlans;
  }
  NSError *selectionError = nil;
  NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
  if (!selection) return @[];
  NSDictionary *paths = [self bundlePathsForSelection:selection];
  NSArray *items = ControlerEnsureArray([self jsonObjectFromFile:paths[@"recurring"] fallback:@[]]);
  [self releaseStorageSelectionAccess:selection];
  return items;
}

- (NSDictionary *)readPartitionEnvelopeForSection:(NSString *)section periodId:(NSString *)periodId
{
  if ([self isFileStorageMode]) {
    NSDictionary *state = [self loadBundleState] ?: @{};
    return [self createPartitionEnvelopeForSection:section periodId:periodId items:[self partitionItemsForState:state section:section periodId:periodId] fingerprint:nil];
  }
  NSError *selectionError = nil;
  NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
  if (!selection) return [self createPartitionEnvelopeForSection:section periodId:periodId items:@[] fingerprint:nil];
  NSDictionary *paths = [self bundlePathsForSelection:selection];
  NSString *relativePath = [self relativePartitionPathForSection:section periodId:periodId];
  id object = [self jsonObjectFromFile:[paths[@"root"] stringByAppendingPathComponent:(relativePath ?: @"")] fallback:nil];
  [self releaseStorageSelectionAccess:selection];
  if ([object isKindOfClass:[NSArray class]]) return [self createPartitionEnvelopeForSection:section periodId:periodId items:(NSArray *)object fingerprint:nil];
  NSDictionary *source = ControlerEnsureDictionary(object);
  return [self createPartitionEnvelopeForSection:section periodId:([self normalizedPeriodId:source[@"periodId"]] ?: periodId) items:ControlerEnsureArray(source[@"items"]) fingerprint:ControlerOptionalTrimmedString(source[@"fingerprint"])];
}

- (BOOL)writeBundlePayload:(NSDictionary *)payload previousManifest:(NSDictionary *)previousManifest toDirectory:(NSString *)directory error:(NSError **)error
{
  if (![self ensureDirectoryAtPath:directory error:error]) return NO;
  if (![self writeJsonObject:payload[@"core"] toFile:[directory stringByAppendingPathComponent:kBundleCoreFileName] error:error]) return NO;
  if (![self writeJsonObject:payload[@"recurringPlans"] toFile:[directory stringByAppendingPathComponent:kBundleRecurringPlansFileName] error:error]) return NO;
  NSMutableSet<NSString *> *desiredFiles = [NSMutableSet set];
  NSDictionary *partitionMap = ControlerEnsureDictionary(payload[@"partitionMap"]);
  for (NSString *section in ControlerPartitionedSections()) {
    NSDictionary *sectionBuckets = ControlerEnsureDictionary(partitionMap[section]);
    for (NSString *periodId in [[sectionBuckets allKeys] sortedArrayUsingSelector:@selector(compare:)]) {
      NSString *relativePath = [self relativePartitionPathForSection:section periodId:periodId];
      if (relativePath.length == 0) continue;
      [desiredFiles addObject:relativePath];
      if (![self writeJsonObject:[self createPartitionEnvelopeForSection:section periodId:periodId items:sectionBuckets[periodId] fingerprint:nil] toFile:[directory stringByAppendingPathComponent:relativePath] error:error]) return NO;
    }
  }
  NSDictionary *oldSections = ControlerEnsureDictionary([self normalizedManifest:previousManifest][@"sections"]);
  for (NSString *section in ControlerPartitionedSections()) {
    for (id partitionValue in ControlerEnsureArray(ControlerEnsureDictionary(oldSections[section])[@"partitions"])) {
      NSString *relativePath = ControlerOptionalTrimmedString(ControlerEnsureDictionary(partitionValue)[@"file"]);
      if (relativePath.length > 0 && ![desiredFiles containsObject:relativePath]) [[self fileManager] removeItemAtPath:[directory stringByAppendingPathComponent:relativePath] error:nil];
    }
  }
  return [self writeJsonObject:payload[@"manifest"] toFile:[directory stringByAppendingPathComponent:kBundleManifestFileName] error:error];
}

- (BOOL)writeBundlePayload:(NSDictionary *)payload previousManifest:(NSDictionary *)previousManifest error:(NSError **)error
{
  NSError *selectionError = nil;
  NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
  if (!selection) {
    if (error) *error = selectionError;
    return NO;
  }
  BOOL success = [self writeBundlePayload:payload previousManifest:previousManifest toDirectory:[self bundleDirectoryPathForSelection:selection] error:error];
  [self releaseStorageSelectionAccess:selection];
  return success;
}

- (NSDictionary *)writeBundleFromState:(NSDictionary *)state legacyBackups:(NSArray *)legacyBackups touchModified:(BOOL)touchModified touchSyncSave:(BOOL)touchSyncSave error:(NSError **)error
{
  if ([self isFileStorageMode]) {
    NSError *selectionError = nil;
    NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
    if (!selection) {
      if (error) *error = selectionError;
      return nil;
    }
    NSDictionary *normalized = [self normalizedState:state touchModified:touchModified touchSyncSave:touchSyncSave];
    NSString *targetPath = ControlerOptionalTrimmedString(selection[@"path"]);
    BOOL success = [self writeJsonObject:normalized toFile:targetPath error:error];
    [self releaseStorageSelectionAccess:selection];
    if (success) [self reloadWidgetsIfSupportedForState:normalized];
    return success ? normalized : nil;
  }
  NSDictionary *previousManifest = [self readManifest];
  NSDictionary *payload = [self splitStateIntoBundle:state legacyBackups:(legacyBackups ?: ControlerEnsureArray(previousManifest[@"legacyBackups"])) touchModified:touchModified touchSyncSave:touchSyncSave];
  if (![self writeBundlePayload:payload previousManifest:previousManifest error:error]) return nil;
  NSDictionary *writtenState = [self buildLegacyStateFromBundlePayload:payload];
  [self reloadWidgetsIfSupportedForState:writtenState];
  return writtenState;
}

- (BOOL)bundleExists
{
  NSError *selectionError = nil;
  NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
  if (!selection) return NO;
  BOOL exists = NO;
  if ([self isFileStorageMode]) {
    NSString *filePath = ControlerOptionalTrimmedString(selection[@"path"]);
    exists = filePath.length > 0 && [[self fileManager] fileExistsAtPath:filePath];
  } else {
    NSDictionary *paths = [self bundlePathsForSelection:selection];
    exists = [[self fileManager] fileExistsAtPath:paths[@"manifest"]];
  }
  [self releaseStorageSelectionAccess:selection];
  return exists;
}

- (NSArray<NSString *> *)bundleRelativeFilePathsFromManifest:(NSDictionary *)manifest
{
  NSDictionary *normalized = [self normalizedManifest:manifest];
  if (!normalized) return @[];
  NSMutableArray<NSString *> *paths = [NSMutableArray arrayWithArray:@[kBundleManifestFileName, kBundleCoreFileName, kBundleRecurringPlansFileName]];
  NSDictionary *sections = ControlerEnsureDictionary(normalized[@"sections"]);
  for (NSString *section in ControlerPartitionedSections()) for (id partitionValue in ControlerEnsureArray(ControlerEnsureDictionary(sections[section])[@"partitions"])) {
    NSString *relativePath = ControlerOptionalTrimmedString(ControlerEnsureDictionary(partitionValue)[@"file"]);
    if (relativePath.length > 0) [paths addObject:relativePath];
  }
  return paths;
}

- (unsigned long long)computeBundleSizeAtRoot:(NSString *)root manifest:(NSDictionary *)manifest
{
  unsigned long long total = 0ULL;
  for (NSString *relativePath in [self bundleRelativeFilePathsFromManifest:manifest]) total += [ControlerEnsureDictionary([[self fileManager] attributesOfItemAtPath:[root stringByAppendingPathComponent:relativePath] error:nil])[NSFileSize] unsignedLongLongValue];
  return total;
}

- (NSDictionary *)probeStorageVersionIncludeHash:(BOOL)includeFallbackHash
{
  NSError *selectionError = nil;
  NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
  if (!selection) {
    return @{@"storagePath": [self manifestPath], @"actualUri": [self storageDirectoryPath], @"storageMode": [self isFileStorageMode] ? @"file" : kBundleMode, @"size": @(0ULL), @"modifiedAt": @(0LL), @"fingerprint": @"", @"supportsModifiedAt": @NO, @"fallbackHashUsed": @NO};
  }

  BOOL fileMode = [ControlerOptionalTrimmedString(selection[@"mode"]) isEqualToString:kStorageModeFile];
  NSDictionary *paths = [self bundlePathsForSelection:selection];
  NSString *basePath = fileMode ? ControlerOptionalTrimmedString(selection[@"path"]) : paths[@"manifest"];
  BOOL hasBundle = !fileMode && [[self fileManager] fileExistsAtPath:paths[@"manifest"]];
  if (basePath.length == 0 || ![[self fileManager] fileExistsAtPath:basePath]) {
    [self releaseStorageSelectionAccess:selection];
    return @{@"storagePath": fileMode ? [self manifestPath] : paths[@"manifest"], @"actualUri": fileMode ? ControlerOptionalTrimmedString(selection[@"path"]) ?: [self manifestPath] : [self storageDirectoryPath], @"storageMode": fileMode ? @"file" : (hasBundle ? kBundleMode : @"file"), @"size": @(0ULL), @"modifiedAt": @(0LL), @"fingerprint": @"", @"supportsModifiedAt": @NO, @"fallbackHashUsed": @NO};
  }

  NSDictionary *attributes = [[self fileManager] attributesOfItemAtPath:basePath error:nil];
  NSDate *modifiedAtDate = attributes[NSFileModificationDate], *createdAtDate = attributes[NSFileCreationDate];
  double modifiedAtMs = modifiedAtDate ? floor([modifiedAtDate timeIntervalSince1970] * 1000.0) : 0.0, createdAtMs = createdAtDate ? floor([createdAtDate timeIntervalSince1970] * 1000.0) : 0.0;
  unsigned long long size = fileMode ? [attributes[NSFileSize] unsignedLongLongValue] : [self computeBundleSizeAtRoot:paths[@"root"] manifest:[self readManifest]];
  NSString *baseFingerprint = [NSString stringWithFormat:@"%@:%llu:%.0f:%.0f", fileMode ? @"file" : @"bundle", size, modifiedAtMs, createdAtMs];
  NSString *hashText = @"";
  if (includeFallbackHash) {
    NSData *data = [NSData dataWithContentsOfFile:basePath];
    if (data.length > 0) {
      unsigned char digest[CC_SHA1_DIGEST_LENGTH];
      CC_SHA1(data.bytes, (CC_LONG)data.length, digest);
      NSMutableString *hash = [NSMutableString stringWithCapacity:(CC_SHA1_DIGEST_LENGTH * 2)];
      for (NSInteger i = 0; i < CC_SHA1_DIGEST_LENGTH; i += 1) [hash appendFormat:@"%02x", digest[i]];
      hashText = hash;
    }
  }
  [self releaseStorageSelectionAccess:selection];
  return @{@"storagePath": fileMode ? [self manifestPath] : paths[@"manifest"], @"actualUri": fileMode ? (ControlerOptionalTrimmedString(selection[@"path"]) ?: [self manifestPath]) : paths[@"root"], @"storageMode": fileMode ? @"file" : kBundleMode, @"size": @(size), @"modifiedAt": @((long long)MAX(modifiedAtMs, createdAtMs)), @"fingerprint": hashText.length > 0 ? [NSString stringWithFormat:@"%@:%@", baseFingerprint, hashText] : baseFingerprint, @"supportsModifiedAt": @(MAX(modifiedAtMs, createdAtMs) > 0.0), @"fallbackHashUsed": @(hashText.length > 0)};
}

- (NSDictionary *)loadBundleState
{
  if ([self isFileStorageMode]) {
    NSError *selectionError = nil;
    NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
    if (!selection) return nil;
    NSDictionary *state = [self readFileStorageStateForSelection:selection error:nil];
    [self releaseStorageSelectionAccess:selection];
    return state;
  }
  NSDictionary *manifest = [self readManifest];
  if (!manifest) return nil;
  NSMutableDictionary *partitionMap = [NSMutableDictionary dictionary];
  NSDictionary *sections = ControlerEnsureDictionary(manifest[@"sections"]);
  for (NSString *section in ControlerPartitionedSections()) {
    NSMutableDictionary *sectionBuckets = [NSMutableDictionary dictionary];
    for (id partitionValue in ControlerEnsureArray(ControlerEnsureDictionary(sections[section])[@"partitions"])) {
      NSString *periodId = [self normalizedPeriodId:ControlerEnsureDictionary(partitionValue)[@"periodId"]];
      if (periodId.length > 0) sectionBuckets[periodId] = ControlerDeepCopyJSON(ControlerEnsureArray([self readPartitionEnvelopeForSection:section periodId:periodId][@"items"])) ?: @[];
    }
    partitionMap[section] = sectionBuckets;
  }
  return [self buildLegacyStateFromBundlePayload:@{@"manifest": manifest, @"core": [self readCoreStateDictionary], @"recurringPlans": [self readRecurringPlansArray], @"partitionMap": partitionMap}];
}

- (BOOL)copyItemAtPath:(NSString *)sourcePath toPath:(NSString *)targetPath error:(NSError **)error
{
  [[self fileManager] removeItemAtPath:targetPath error:nil];
  if (![self ensureDirectoryAtPath:[targetPath stringByDeletingLastPathComponent] error:error]) return NO;
  return [[self fileManager] copyItemAtPath:sourcePath toPath:targetPath error:error];
}

- (BOOL)ensureStorageReady:(NSError **)error
{
  if ([self isFileStorageMode]) {
    NSError *selectionError = nil;
    NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
    if (!selection) {
      if (error) *error = selectionError;
      return NO;
    }
    NSString *filePath = ControlerOptionalTrimmedString(selection[@"path"]);
    if (filePath.length == 0) {
      [self releaseStorageSelectionAccess:selection];
      if (error) *error = [self bridgeErrorWithDescription:@"当前未绑定外部 JSON 存储文件。" code:1006];
      return NO;
    }
    BOOL exists = [[self fileManager] fileExistsAtPath:filePath];
    NSDictionary *existingState = exists ? [self readFileStorageStateForSelection:selection error:error] : nil;
    if (exists && !existingState) {
      NSData *rawData = [NSData dataWithContentsOfFile:filePath];
      if (rawData.length > 0) {
        [self releaseStorageSelectionAccess:selection];
        return NO;
      }
    }
    if (!exists || !existingState) {
      NSDictionary *seedState = [self normalizedState:@{} touchModified:YES touchSyncSave:YES];
      BOOL success = [self writeJsonObject:seedState toFile:filePath error:error];
      [self releaseStorageSelectionAccess:selection];
      return success;
    }
    [self releaseStorageSelectionAccess:selection];
    return YES;
  }

  NSError *selectionError = nil;
  NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
  if (!selection) {
    if (error) *error = selectionError;
    return NO;
  }
  NSDictionary *paths = [self bundlePathsForSelection:selection];
  if (![self ensureDirectoryAtPath:paths[@"root"] error:error]) {
    [self releaseStorageSelectionAccess:selection];
    return NO;
  }
  if ([[self fileManager] fileExistsAtPath:paths[@"manifest"]]) {
    NSDictionary *existingState = [self loadBundleState];
    [self releaseStorageSelectionAccess:selection];
    if (!existingState) {
      if (error) *error = [self bridgeErrorWithDescription:@"目标目录中的 bundle 数据无效，无法载入。" code:1015];
      return NO;
    }
    return YES;
  }
  BOOL migratedLegacyData = NO;
  if ([[self fileManager] fileExistsAtPath:paths[@"legacy"]]) {
    NSError *validationError = nil;
    NSDictionary *legacyState = [self validatedStorageStateFromObject:[self jsonObjectFromFile:paths[@"legacy"] fallback:nil] error:&validationError];
    if (!legacyState) {
      [self releaseStorageSelectionAccess:selection];
      if (error) *error = validationError;
      return NO;
    }
    NSString *backupName = [NSString stringWithFormat:@"controler-data.legacy-%@.json", [self timestampTagFromDate:[NSDate date]]];
    NSString *backupPath = [paths[@"root"] stringByAppendingPathComponent:backupName];
    if (![self copyItemAtPath:paths[@"legacy"] toPath:backupPath error:error]) {
      [self releaseStorageSelectionAccess:selection];
      return NO;
    }
    NSError *writeError = nil;
    if (![self writeBundleFromState:legacyState legacyBackups:@[@{@"file": backupName, @"source": @"legacy-auto-migration", @"createdAt": [self isoNow]}] touchModified:YES touchSyncSave:YES error:&writeError]) {
      [self releaseStorageSelectionAccess:selection];
      if (error) *error = writeError;
      return NO;
    }
    [[self fileManager] removeItemAtPath:paths[@"legacy"] error:nil];
    migratedLegacyData = YES;
  }
  if (![[self fileManager] fileExistsAtPath:paths[@"manifest"]]) {
    NSError *writeError = nil;
    if (![self writeBundleFromState:@{} legacyBackups:nil touchModified:YES touchSyncSave:YES error:&writeError]) {
      [self releaseStorageSelectionAccess:selection];
      if (error) *error = writeError;
      return NO;
    }
  }
  [self releaseStorageSelectionAccess:selection];
  if (migratedLegacyData) [self maybeRunAutoBackup];
  return YES;
}

- (NSArray<NSString *> *)periodIdsFromStartDateKey:(NSString *)startDateKey endDateKey:(NSString *)endDateKey
{
  NSDate *startDate = [self dateFromValue:startDateKey], *endDate = [self dateFromValue:endDateKey];
  if (!startDate || !endDate) return @[];
  if ([startDate compare:endDate] == NSOrderedDescending) { NSDate *tmp = startDate; startDate = endDate; endDate = tmp; }
  NSCalendar *calendar = [NSCalendar currentCalendar];
  NSDate *cursor = [calendar dateFromComponents:[calendar components:(NSCalendarUnitYear | NSCalendarUnitMonth) fromDate:startDate]];
  NSDate *target = [calendar dateFromComponents:[calendar components:(NSCalendarUnitYear | NSCalendarUnitMonth) fromDate:endDate]];
  NSMutableArray<NSString *> *periodIds = [NSMutableArray array];
  NSDateComponents *step = [[NSDateComponents alloc] init]; step.month = 1;
  while ([cursor compare:target] != NSOrderedDescending) {
    NSString *periodId = [self periodIdFromDate:cursor];
    if (periodId.length > 0) [periodIds addObject:periodId];
    cursor = [calendar dateByAddingComponents:step toDate:cursor options:0];
    if (!cursor) break;
  }
  return periodIds;
}

- (NSDictionary *)normalizedRangeFromScope:(NSDictionary *)scope
{
  NSMutableArray<NSString *> *requested = [NSMutableArray array];
  for (id value in ControlerEnsureArray(ControlerEnsureDictionary(scope)[@"periodIds"])) {
    NSString *periodId = [self normalizedPeriodId:value];
    if (periodId.length > 0) [requested addObject:periodId];
  }
  if (requested.count > 0) return @{@"periodIds": requested, @"startDate": [NSNull null], @"endDate": [NSNull null]};
  NSString *startDate = [self dateKeyFromValue:ControlerEnsureDictionary(scope)[@"startDate"] ?: ControlerEnsureDictionary(scope)[@"start"]];
  NSString *endDate = [self dateKeyFromValue:ControlerEnsureDictionary(scope)[@"endDate"] ?: ControlerEnsureDictionary(scope)[@"end"]];
  return @{@"periodIds": startDate.length > 0 && endDate.length > 0 ? [self periodIdsFromStartDateKey:startDate endDateKey:endDate] : @[], @"startDate": ControlerJSONValue(startDate), @"endDate": ControlerJSONValue(endDate)};
}

- (NSString *)mergeKeyForSection:(NSString *)section item:(NSDictionary *)item
{
  NSString *identifier = ControlerOptionalTrimmedString(item[@"id"]);
  if (identifier.length > 0) return [NSString stringWithFormat:@"id:%@", identifier];
  if ([section isEqualToString:@"records"]) return [NSString stringWithFormat:@"%@|%@|%@|%@|%@|%@", ControlerTrimmedString(item[@"projectId"]), ControlerTrimmedString(item[@"name"]), ControlerTrimmedString(item[@"startTime"]), ControlerTrimmedString(item[@"endTime"]), ControlerTrimmedString(item[@"timestamp"]), ControlerTrimmedString(item[@"spendtime"])];
  if ([section isEqualToString:@"diaryEntries"]) return [NSString stringWithFormat:@"%@|%@|%@", ControlerTrimmedString(item[@"date"]), ControlerTrimmedString(item[@"title"]), ControlerTrimmedString(item[@"updatedAt"])];
  if ([section isEqualToString:@"dailyCheckins"]) return [NSString stringWithFormat:@"%@|%@", ControlerTrimmedString(item[@"itemId"]), ControlerTrimmedString(item[@"date"])];
  if ([section isEqualToString:@"checkins"]) return [NSString stringWithFormat:@"%@|%@|%@", ControlerTrimmedString(item[@"todoId"]), ControlerTrimmedString(item[@"time"]), ControlerTrimmedString(item[@"message"])];
  if ([section isEqualToString:@"plans"]) return [NSString stringWithFormat:@"%@|%@|%@|%@|%@", ControlerTrimmedString(item[@"name"]), ControlerTrimmedString(item[@"date"]), ControlerTrimmedString(item[@"startTime"]), ControlerTrimmedString(item[@"endTime"]), ControlerTrimmedString(item[@"repeat"])];
  return [self serializeObject:item];
}

- (NSArray *)mergeItemsForSection:(NSString *)section existingItems:(NSArray *)existingItems incomingItems:(NSArray *)incomingItems mode:(NSString *)mode
{
  if (![[[ControlerTrimmedString(mode) lowercaseString] copy] isEqualToString:@"merge"]) return [self sortedItems:incomingItems forSection:section];
  NSMutableDictionary<NSString *, id> *merged = [NSMutableDictionary dictionary];
  for (id itemValue in [self sortedItems:existingItems forSection:section]) merged[[self mergeKeyForSection:section item:ControlerEnsureDictionary(itemValue)]] = ControlerDeepCopyJSON(itemValue) ?: itemValue;
  for (id itemValue in [self sortedItems:incomingItems forSection:section]) merged[[self mergeKeyForSection:section item:ControlerEnsureDictionary(itemValue)]] = ControlerDeepCopyJSON(itemValue) ?: itemValue;
  return [self sortedItems:[merged allValues] forSection:section];
}

- (BOOL)items:(NSArray *)items belongToSection:(NSString *)section periodId:(NSString *)periodId
{
  NSString *resolvedPeriodId = [self normalizedPeriodId:periodId]; if (resolvedPeriodId.length == 0) resolvedPeriodId = kUndatedPeriodId;
  for (id itemValue in ControlerEnsureArray(items)) {
    NSDictionary *item = ControlerEnsureDictionary(itemValue);
    if ([section isEqualToString:@"plans"] && [self isRecurringPlan:item]) return NO;
    NSString *itemPeriodId = [self periodIdForSection:section item:item]; if (itemPeriodId.length == 0) itemPeriodId = kUndatedPeriodId;
    if (![itemPeriodId isEqualToString:resolvedPeriodId]) return NO;
  }
  return YES;
}

- (NSDictionary *)storageStatusForState:(NSDictionary *)state
{
  NSDictionary *manifest = [self readManifest], *version = [self probeStorageVersionIncludeHash:YES];
  unsigned long long recordCount = 0ULL; for (id partitionValue in ControlerEnsureArray(ControlerEnsureDictionary(ControlerEnsureDictionary(manifest[@"sections"])[@"records"])[@"partitions"])) recordCount += MAX(0, [ControlerEnsureDictionary(partitionValue)[@"count"] integerValue]);
  NSDictionary *selection = [self storedStorageSelection];
  NSString *mode = ControlerOptionalTrimmedString(selection[@"mode"]);
  BOOL fileMode = [mode isEqualToString:kStorageModeFile];
  BOOL isCustomPath = fileMode || [mode isEqualToString:kStorageModeDirectory];
  NSString *storagePath = fileMode ? (ControlerOptionalTrimmedString(selection[@"path"]) ?: [self manifestPath]) : [self manifestPath];
  NSString *storageDirectory = fileMode ? (ControlerOptionalTrimmedString(selection[@"parentPath"]) ?: [self storageDirectoryPath]) : [self storageDirectoryPath];
  NSString *syncFileName = fileMode ? (ControlerOptionalTrimmedString(selection[@"displayName"]) ?: [storagePath lastPathComponent] ?: kLegacyStorageFileName) : kBundleManifestFileName;
  NSString *storageMode = fileMode ? @"file" : kBundleMode;
  NSString *serialized = [self serializeObject:(state ?: @{})];
  unsigned long long size = [version[@"size"] unsignedLongLongValue]; if (size == 0ULL) size = (unsigned long long)[serialized lengthOfBytesUsingEncoding:NSUTF8StringEncoding];
  return @{@"projects": @([ControlerEnsureArray(state[@"projects"]) count]), @"records": @(recordCount), @"size": @(size), @"modifiedAt": version[@"modifiedAt"] ?: @(0LL), @"fingerprint": ControlerTrimmedString(version[@"fingerprint"]), @"supportsModifiedAt": version[@"supportsModifiedAt"] ?: @NO, @"fallbackHashUsed": version[@"fallbackHashUsed"] ?: @NO, @"storagePath": storagePath, @"actualUri": ControlerOptionalTrimmedString(version[@"actualUri"]) ?: storagePath, @"storageDirectory": storageDirectory, @"defaultStoragePath": [self defaultManifestPath], @"defaultStorageDirectory": [self defaultBundleDirectoryPath], @"userDataPath": [self documentsPath], @"documentsPath": [self documentsPath], @"storageMode": storageMode, @"bundleMode": kBundleMode, @"isCustomPath": @(isCustomPath), @"syncFileName": syncFileName, @"syncMeta": ControlerJSONValue(state[@"syncMeta"]), @"formatVersion": manifest[@"formatVersion"] ?: @(kBundleFormatVersion), @"legacyBackups": ControlerDeepCopyJSON(ControlerEnsureArray(manifest[@"legacyBackups"])) ?: @[], @"isNativeApp": @YES, @"platform": @"ios"};
}

- (NSDictionary *)coreStatePayload
{
  NSDictionary *state = [self loadBundleState] ?: [self normalizedState:@{} touchModified:NO touchSyncSave:NO];
  NSMutableArray *recurringPlans = [NSMutableArray array];
  for (id itemValue in ControlerEnsureArray(state[@"plans"])) if ([self isRecurringPlan:itemValue]) [recurringPlans addObject:ControlerDeepCopyJSON(itemValue) ?: itemValue];
  NSDictionary *selection = [self storedStorageSelection];
  BOOL fileMode = [ControlerOptionalTrimmedString(selection[@"mode"]) isEqualToString:kStorageModeFile];
  NSString *storagePath = fileMode ? (ControlerOptionalTrimmedString(selection[@"path"]) ?: [self manifestPath]) : [self manifestPath];
  NSString *storageDirectory = fileMode ? (ControlerOptionalTrimmedString(selection[@"parentPath"]) ?: [self storageDirectoryPath]) : [self storageDirectoryPath];
  NSMutableDictionary *payload = [NSMutableDictionary dictionary];
  for (NSString *key in ControlerCoreSectionKeys()) {
    id value = ControlerDeepCopyJSON(state[key]) ?: state[key];
    if (value) payload[key] = value;
  }
  payload[@"storagePath"] = storagePath;
  payload[@"storageDirectory"] = storageDirectory;
  payload[@"userDataPath"] = [self documentsPath];
  payload[@"documentsPath"] = [self documentsPath];
  payload[@"recurringPlans"] = recurringPlans;
  return payload;
}

- (NSDictionary *)planBootstrapPayload
{
  NSDictionary *core = [self readCoreStateDictionary] ?: @{};
  return @{
    @"yearlyGoals": ControlerDeepCopyJSON(ControlerEnsureDictionary(core[@"yearlyGoals"])) ?: @{},
    @"recurringPlans": ControlerDeepCopyJSON([self readRecurringPlansArray]) ?: @[],
  };
}

- (NSDictionary *)normalizeAutoBackupSettings:(NSDictionary *)settings
{
  NSDictionary *source = ControlerEnsureDictionary(settings);
  NSString *intervalUnit = ControlerOptionalTrimmedString(source[@"intervalUnit"]);
  if (![ControlerAutoBackupUnits() containsObject:intervalUnit]) intervalUnit = @"day";
  NSInteger intervalValue = [source[@"intervalValue"] respondsToSelector:@selector(integerValue)] ? [source[@"intervalValue"] integerValue] : 1;
  NSInteger maxBackups = [source[@"maxBackups"] respondsToSelector:@selector(integerValue)] ? [source[@"maxBackups"] integerValue] : 7;
  return @{@"enabled": @([source[@"enabled"] boolValue]), @"intervalValue": @(MAX(1, intervalValue)), @"intervalUnit": intervalUnit, @"maxBackups": @(MAX(1, maxBackups))};
}

- (NSDictionary *)readAutoBackupSettings { return [self normalizeAutoBackupSettings:ControlerEnsureDictionary([[NSUserDefaults standardUserDefaults] dictionaryForKey:kAutoBackupSettingsDefaultsKey])]; }
- (void)saveAutoBackupSettings:(NSDictionary *)settings { [[NSUserDefaults standardUserDefaults] setObject:[self normalizeAutoBackupSettings:settings] forKey:kAutoBackupSettingsDefaultsKey]; }

- (NSDictionary *)normalizeAutoBackupState:(NSDictionary *)state
{
  NSDictionary *source = ControlerEnsureDictionary(state);
  NSMutableDictionary *normalized = [NSMutableDictionary dictionary];
  for (NSString *key in @[@"lastAttemptAt", @"lastError", @"lastBackedUpFingerprint", @"latestBackupFile", @"latestBackupPath", @"latestBackupAt", @"targetBackupDirectory"]) {
    NSString *value = ControlerOptionalTrimmedString(source[key]);
    if (value.length > 0) normalized[key] = value;
  }
  unsigned long long latestBackupSize = [source[@"latestBackupSize"] unsignedLongLongValue];
  if (latestBackupSize > 0ULL) normalized[@"latestBackupSize"] = @(latestBackupSize);
  return normalized;
}

- (NSDictionary *)storedAutoBackupState { return [self normalizeAutoBackupState:ControlerEnsureDictionary([[NSUserDefaults standardUserDefaults] dictionaryForKey:kAutoBackupStateDefaultsKey])]; }

- (NSDictionary *)effectiveAutoBackupState
{
  NSDictionary *stored = [self storedAutoBackupState];
  NSString *targetBackupDirectory = ControlerOptionalTrimmedString(stored[@"targetBackupDirectory"]);
  return targetBackupDirectory.length > 0 && ![targetBackupDirectory isEqualToString:[self backupDirectoryPath]] ? @{} : stored;
}

- (void)saveAutoBackupState:(NSDictionary *)state
{
  NSMutableDictionary *normalized = [[self normalizeAutoBackupState:state] mutableCopy];
  normalized[@"targetBackupDirectory"] = [self backupDirectoryPath];
  [[NSUserDefaults standardUserDefaults] setObject:normalized forKey:kAutoBackupStateDefaultsKey];
}

- (NSArray<NSDictionary *> *)listAutoBackupEntries
{
  BOOL isDirectory = NO;
  if (![[self fileManager] fileExistsAtPath:[self backupDirectoryPath] isDirectory:&isDirectory] || !isDirectory) return @[];
  NSMutableArray<NSDictionary *> *entries = [NSMutableArray array];
  for (NSString *fileName in [[self fileManager] contentsOfDirectoryAtPath:[self backupDirectoryPath] error:nil]) {
    if (![[[fileName pathExtension] lowercaseString] isEqualToString:@"zip"]) continue;
    NSString *path = [[self backupDirectoryPath] stringByAppendingPathComponent:fileName];
    NSDictionary *attributes = [[self fileManager] attributesOfItemAtPath:path error:nil];
    NSDate *modifiedAt = attributes[NSFileModificationDate] ?: attributes[NSFileCreationDate];
    [entries addObject:@{@"file": fileName, @"path": path, @"size": @([attributes[NSFileSize] unsignedLongLongValue]), @"modifiedAtDate": modifiedAt ?: [NSDate dateWithTimeIntervalSince1970:0], @"modifiedAtIso": ControlerJSONValue([self isoStringFromDate:modifiedAt])}];
  }
  [entries sortUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) {
    NSComparisonResult compare = [right[@"modifiedAtDate"] compare:left[@"modifiedAtDate"]];
    return compare != NSOrderedSame ? compare : [ControlerTrimmedString(right[@"file"]) compare:ControlerTrimmedString(left[@"file"])];
  }];
  return entries;
}

- (void)pruneAutoBackupEntriesKeepingMax:(NSInteger)maxBackups
{
  NSArray<NSDictionary *> *entries = [self listAutoBackupEntries];
  for (NSUInteger index = (NSUInteger)MAX(1, maxBackups); index < entries.count; index += 1) {
    NSString *path = ControlerOptionalTrimmedString(entries[index][@"path"]);
    if (path.length > 0) [[self fileManager] removeItemAtPath:path error:nil];
  }
}

- (NSTimeInterval)autoBackupIntervalInSecondsForSettings:(NSDictionary *)settings
{
  NSDictionary *normalized = [self normalizeAutoBackupSettings:settings];
  NSInteger value = MAX(1, [normalized[@"intervalValue"] integerValue]), multiplier = 24 * 60 * 60;
  if ([normalized[@"intervalUnit"] isEqualToString:@"hour"]) multiplier = 60 * 60;
  else if ([normalized[@"intervalUnit"] isEqualToString:@"week"]) multiplier = 7 * 24 * 60 * 60;
  return (NSTimeInterval)(value * multiplier);
}

- (BOOL)shouldRunAutoBackupWithSettings:(NSDictionary *)settings state:(NSDictionary *)state fingerprint:(NSString *)fingerprint force:(BOOL)force
{
  if (force) return YES;
  if ([settings[@"enabled"] boolValue] != YES) return NO;
  NSString *currentFingerprint = ControlerOptionalTrimmedString(fingerprint), *previousFingerprint = ControlerOptionalTrimmedString(state[@"lastBackedUpFingerprint"]);
  if (currentFingerprint.length > 0 && previousFingerprint.length > 0 && [currentFingerprint isEqualToString:previousFingerprint]) return NO;
  NSDate *anchorDate = [self dateFromValue:ControlerOptionalTrimmedString(state[@"latestBackupAt"]) ?: ControlerOptionalTrimmedString(state[@"lastAttemptAt"])];
  return anchorDate ? [[NSDate date] timeIntervalSinceDate:anchorDate] >= [self autoBackupIntervalInSecondsForSettings:settings] : YES;
}

- (BOOL)writeBundleSnapshotToDirectory:(NSString *)directory error:(NSError **)error
{
  if ([self isFileStorageMode]) {
    NSDictionary *state = [self loadBundleState];
    if (!state) {
      if (error) *error = [self bridgeErrorWithDescription:@"当前没有可用的 iOS 存储数据可导出。" code:1004];
      return NO;
    }
    NSDictionary *payload = [self splitStateIntoBundle:state legacyBackups:ControlerEnsureArray([self readManifest][@"legacyBackups"]) touchModified:NO touchSyncSave:NO];
    return [self writeBundlePayload:payload previousManifest:nil toDirectory:directory error:error];
  }
  NSDictionary *manifest = [self readManifest];
  if (!manifest) {
    if (error) *error = [self bridgeErrorWithDescription:@"当前没有可用的 bundle 存储清单。" code:1004];
    return NO;
  }
  NSError *selectionError = nil;
  NSDictionary *selection = [self resolvedStorageSelectionWithError:&selectionError];
  if (!selection) {
    if (error) *error = selectionError;
    return NO;
  }
  NSDictionary *paths = [self bundlePathsForSelection:selection];
  BOOL success = YES;
  if (![self ensureDirectoryAtPath:directory error:error]) success = NO;
  if (success) {
    for (NSString *relativePath in [self bundleRelativeFilePathsFromManifest:manifest]) {
      if (![self copyItemAtPath:[paths[@"root"] stringByAppendingPathComponent:relativePath] toPath:[directory stringByAppendingPathComponent:relativePath] error:error]) {
        success = NO;
        break;
      }
    }
  }
  [self releaseStorageSelectionAccess:selection];
  return success;
}

- (NSDictionary *)autoBackupStatusWithError:(NSString *)overrideError
{
  [self ensureStorageReady:nil];
  NSDictionary *settings = [self readAutoBackupSettings], *state = [self effectiveAutoBackupState];
  NSDictionary *latest = [self listAutoBackupEntries].firstObject;
  NSString *lastError = ControlerOptionalTrimmedString(overrideError) ?: ControlerOptionalTrimmedString(state[@"lastError"]);
  return @{@"enabled": settings[@"enabled"], @"intervalValue": settings[@"intervalValue"], @"intervalUnit": settings[@"intervalUnit"], @"maxBackups": settings[@"maxBackups"], @"backupDirectory": [self backupDirectoryPath], @"backupDirectoryKind": @"file-path", @"backupCount": @([self listAutoBackupEntries].count), @"latestBackupFile": ControlerJSONValue(ControlerOptionalTrimmedString(latest[@"file"])), @"latestBackupPath": ControlerJSONValue(ControlerOptionalTrimmedString(latest[@"path"])), @"latestBackupAt": latest ? latest[@"modifiedAtIso"] : [NSNull null], @"latestBackupSize": latest[@"size"] ?: @(0ULL), @"lastAttemptAt": ControlerJSONValue(ControlerOptionalTrimmedString(state[@"lastAttemptAt"])), @"lastError": ControlerJSONValue(lastError), @"lastBackedUpFingerprint": ControlerOptionalTrimmedString(state[@"lastBackedUpFingerprint"]) ?: @""};
}

- (NSDictionary *)executeAutoBackupForce:(BOOL)force
{
  @synchronized(self) { if (self.autoBackupInFlight) return [self autoBackupStatusWithError:nil]; self.autoBackupInFlight = YES; }
  NSDictionary *result = nil;
  @try {
    NSError *storageError = nil;
    if (![self ensureStorageReady:&storageError]) return [self autoBackupStatusWithError:storageError.localizedDescription];
    NSDictionary *settings = [self readAutoBackupSettings], *currentState = [self effectiveAutoBackupState], *version = [self probeStorageVersionIncludeHash:YES];
    NSString *fingerprint = ControlerTrimmedString(version[@"fingerprint"]);
    if (![self shouldRunAutoBackupWithSettings:settings state:currentState fingerprint:fingerprint force:force]) return [self autoBackupStatusWithError:nil];
    NSString *attemptedAt = [self isoNow], *tempRoot = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"order-auto-backup-%@", [NSUUID UUID].UUIDString]], *snapshotDirectory = [tempRoot stringByAppendingPathComponent:@"bundle"], *tempZipPath = [tempRoot stringByAppendingPathComponent:@"backup.zip"], *backupFileName = [NSString stringWithFormat:@"order-auto-backup-%@.zip", [self timestampTagFromDate:[NSDate date]]], *targetPath = [[self backupDirectoryPath] stringByAppendingPathComponent:backupFileName];
    NSError *error = nil;
    if (![self ensureDirectoryAtPath:[self backupDirectoryPath] error:&error] || ![self writeBundleSnapshotToDirectory:snapshotDirectory error:&error] || ![SSZipArchive createZipFileAtPath:tempZipPath withContentsOfDirectory:snapshotDirectory]) {
      NSMutableDictionary *failedState = [currentState mutableCopy] ?: [NSMutableDictionary dictionary];
      failedState[@"lastAttemptAt"] = attemptedAt;
      failedState[@"lastError"] = error.localizedDescription ?: @"创建 ZIP 备份失败。";
      [self saveAutoBackupState:failedState];
      [[self fileManager] removeItemAtPath:tempRoot error:nil];
      return [self autoBackupStatusWithError:nil];
    }
    [[self fileManager] removeItemAtPath:targetPath error:nil];
    if (![[self fileManager] moveItemAtPath:tempZipPath toPath:targetPath error:&error]) {
      NSMutableDictionary *failedState = [currentState mutableCopy] ?: [NSMutableDictionary dictionary];
      failedState[@"lastAttemptAt"] = attemptedAt;
      failedState[@"lastError"] = error.localizedDescription ?: @"保存 ZIP 备份失败。";
      [self saveAutoBackupState:failedState];
      [[self fileManager] removeItemAtPath:tempRoot error:nil];
      return [self autoBackupStatusWithError:nil];
    }
    [self pruneAutoBackupEntriesKeepingMax:MAX(1, [settings[@"maxBackups"] integerValue])];
    NSDictionary *attributes = [[self fileManager] attributesOfItemAtPath:targetPath error:nil];
    [self saveAutoBackupState:@{@"lastAttemptAt": attemptedAt, @"lastBackedUpFingerprint": fingerprint ?: @"", @"latestBackupFile": backupFileName, @"latestBackupPath": targetPath, @"latestBackupAt": [self isoStringFromDate:(attributes[NSFileModificationDate] ?: [NSDate date])] ?: attemptedAt, @"latestBackupSize": @([attributes[NSFileSize] unsignedLongLongValue])}];
    [[self fileManager] removeItemAtPath:tempRoot error:nil];
    result = [self autoBackupStatusWithError:nil];
  } @finally {
    @synchronized(self) { self.autoBackupInFlight = NO; }
  }
  return result ?: [self autoBackupStatusWithError:nil];
}

- (void)maybeRunAutoBackup { dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{ [self executeAutoBackupForce:NO]; }); }

- (UIViewController *)topViewController
{
  UIWindow *targetWindow = nil;
  if (@available(iOS 13.0, *)) {
    for (UIScene *scene in [UIApplication sharedApplication].connectedScenes) if ([scene isKindOfClass:[UIWindowScene class]]) {
      for (UIWindow *window in ((UIWindowScene *)scene).windows) if (window.isKeyWindow) { targetWindow = window; break; }
      if (!targetWindow && ((UIWindowScene *)scene).windows.count > 0) targetWindow = ((UIWindowScene *)scene).windows.firstObject;
      if (targetWindow) break;
    }
  }
  if (!targetWindow) targetWindow = [UIApplication sharedApplication].delegate.window;
  UIViewController *controller = targetWindow.rootViewController;
  while (controller.presentedViewController) controller = controller.presentedViewController;
  return controller;
}

- (NSString *)temporaryExportsDirectoryPath
{
  return [NSTemporaryDirectory() stringByAppendingPathComponent:@"order-exports"];
}

- (NSString *)temporaryExportPathWithExtension:(NSString *)extension preferredFileName:(NSString *)preferredFileName
{
  NSString *safeExtension = ControlerTrimmedString(extension);
  NSString *safeFileName = ControlerTrimmedString(preferredFileName);
  if (safeFileName.length == 0) {
    NSString *baseName = [NSString stringWithFormat:@"order-export-%@", [self timestampTagFromDate:[NSDate date]]];
    safeFileName = safeExtension.length > 0 ? [baseName stringByAppendingPathExtension:safeExtension] : baseName;
  }
  if (safeExtension.length > 0 && ![[[safeFileName pathExtension] lowercaseString] isEqualToString:[safeExtension lowercaseString]]) {
    safeFileName = [safeFileName stringByAppendingPathExtension:safeExtension];
  }
  return [[self temporaryExportsDirectoryPath] stringByAppendingPathComponent:safeFileName];
}

- (void)presentShareControllerForPath:(NSString *)filePath
                             message:(NSString *)message
                            resolver:(RCTPromiseResolveBlock)resolve
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *viewController = [self topViewController];
    if (!viewController || filePath.length == 0 || ![[self fileManager] fileExistsAtPath:filePath]) {
      resolve([self serializeObject:@{@"ok": @NO, @"shared": @NO, @"path": ControlerJSONValue(filePath), @"message": @"当前无法打开分享面板。"}]);
      return;
    }
    UIActivityViewController *controller = [[UIActivityViewController alloc] initWithActivityItems:@[[NSURL fileURLWithPath:filePath]] applicationActivities:nil];
    if (controller.popoverPresentationController) {
      controller.popoverPresentationController.sourceView = viewController.view;
      controller.popoverPresentationController.sourceRect = CGRectMake(CGRectGetMidX(viewController.view.bounds), CGRectGetMidY(viewController.view.bounds), 1, 1);
    }
    [viewController presentViewController:controller animated:YES completion:^{
      resolve([self serializeObject:@{@"ok": @YES, @"shared": @YES, @"path": filePath, @"message": message ?: @"已打开分享面板。"}]);
    }];
  });
}

- (NSArray<NSDictionary *> *)widgetKindDescriptors
{
  return @[
    @{@"id": @"start-timer", @"title": @"开始计时", @"subtitle": @"打开记录页开始或结束计时", @"page": @"index", @"action": @"start-timer"},
    @{@"id": @"write-diary", @"title": @"写日记", @"subtitle": @"打开记录页继续今天的日记", @"page": @"diary", @"action": @"new-diary"},
    @{@"id": @"week-grid", @"title": @"一周表格视图", @"subtitle": @"查看近 7 天时段分布", @"page": @"stats", @"action": @"show-week-grid"},
    @{@"id": @"day-pie", @"title": @"一天的饼状图", @"subtitle": @"查看今天的项目时间占比", @"page": @"stats", @"action": @"show-day-pie"},
    @{@"id": @"todos", @"title": @"待办事项", @"subtitle": @"查看今天的待办列表", @"page": @"todo", @"action": @"show-todos"},
    @{@"id": @"checkins", @"title": @"打卡列表", @"subtitle": @"查看今天的打卡项", @"page": @"todo", @"action": @"show-checkins"},
    @{@"id": @"week-view", @"title": @"周视图", @"subtitle": @"查看未来一周计划", @"page": @"plan", @"action": @"show-week-view"},
    @{@"id": @"year-view", @"title": @"年视图", @"subtitle": @"查看全年目标摘要", @"page": @"plan", @"action": @"show-year-view"},
  ];
}

- (NSURL *)launchURLForPage:(NSString *)page action:(NSString *)action source:(NSString *)source kind:(NSString *)kind
{
  NSURLComponents *components = [[NSURLComponents alloc] init];
  components.scheme = kControlerLaunchURLScheme;
  components.host = @"launch";
  components.queryItems = @[
    [NSURLQueryItem queryItemWithName:@"page" value:ControlerOptionalTrimmedString(page) ?: @""],
    [NSURLQueryItem queryItemWithName:@"action" value:ControlerOptionalTrimmedString(action) ?: @""],
    [NSURLQueryItem queryItemWithName:@"source" value:ControlerOptionalTrimmedString(source) ?: kWidgetLaunchSource],
    [NSURLQueryItem queryItemWithName:@"kind" value:ControlerOptionalTrimmedString(kind) ?: @""],
  ];
  return components.URL;
}

- (NSString *)widgetSummaryForKind:(NSString *)kind state:(NSDictionary *)state
{
  NSString *todayKey = [self dateKeyFromDate:[NSDate date]] ?: @"";
  NSDate *now = [NSDate date];
  NSDate *weekAgo = [[NSCalendar currentCalendar] dateByAddingUnit:NSCalendarUnitDay value:-6 toDate:now options:0];
  NSDate *weekAhead = [[NSCalendar currentCalendar] dateByAddingUnit:NSCalendarUnitDay value:6 toDate:now options:0];
  NSInteger todayRecords = 0, todayDiaryEntries = 0, pendingTodos = 0, todayCheckins = 0, nextWeekPlans = 0, yearlyGoals = [ControlerEnsureArray(ControlerEnsureDictionary(state[@"yearlyGoals"])[@"goals"]) count], recentRecords = 0;
  for (id itemValue in ControlerEnsureArray(state[@"records"])) {
    NSDictionary *item = ControlerEnsureDictionary(itemValue);
    NSDate *date = [self sectionDateForSection:@"records" item:item];
    NSString *dateKey = [self dateKeyFromDate:date];
    if ([dateKey isEqualToString:todayKey]) todayRecords += 1;
    if (date && weekAgo && [date compare:weekAgo] != NSOrderedAscending) recentRecords += 1;
  }
  for (id itemValue in ControlerEnsureArray(state[@"diaryEntries"])) if ([[self dateKeyFromValue:ControlerEnsureDictionary(itemValue)[@"date"]] isEqualToString:todayKey]) todayDiaryEntries += 1;
  for (id itemValue in ControlerEnsureArray(state[@"todos"])) if (![ControlerEnsureDictionary(itemValue)[@"completed"] boolValue]) pendingTodos += 1;
  for (id itemValue in ControlerEnsureArray(state[@"dailyCheckins"])) if ([[self dateKeyFromValue:ControlerEnsureDictionary(itemValue)[@"date"]] isEqualToString:todayKey]) todayCheckins += 1;
  for (id itemValue in ControlerEnsureArray(state[@"plans"])) {
    NSDictionary *item = ControlerEnsureDictionary(itemValue);
    if ([self isRecurringPlan:item]) continue;
    NSDate *date = [self sectionDateForSection:@"plans" item:item];
    if (!date || !weekAhead) continue;
    if ([date compare:now] != NSOrderedAscending && [date compare:weekAhead] != NSOrderedDescending) nextWeekPlans += 1;
  }

  if ([kind isEqualToString:@"start-timer"]) return [NSString stringWithFormat:@"今日记录 %ld 条", (long)todayRecords];
  if ([kind isEqualToString:@"write-diary"]) return [NSString stringWithFormat:@"今日日记 %ld 条", (long)todayDiaryEntries];
  if ([kind isEqualToString:@"week-grid"]) return [NSString stringWithFormat:@"近 7 天记录 %ld 条", (long)recentRecords];
  if ([kind isEqualToString:@"day-pie"]) return [NSString stringWithFormat:@"今日项目记录 %ld 条", (long)todayRecords];
  if ([kind isEqualToString:@"todos"]) return [NSString stringWithFormat:@"未完成待办 %ld 项", (long)pendingTodos];
  if ([kind isEqualToString:@"checkins"]) return [NSString stringWithFormat:@"今日打卡 %ld 项", (long)todayCheckins];
  if ([kind isEqualToString:@"week-view"]) return [NSString stringWithFormat:@"未来 7 天计划 %ld 项", (long)nextWeekPlans];
  if ([kind isEqualToString:@"year-view"]) return [NSString stringWithFormat:@"年度目标 %ld 项", (long)yearlyGoals];
  return @"打开应用查看详情";
}

- (NSURL *)widgetSnapshotURL
{
  NSURL *containerURL = [[NSFileManager defaultManager] containerURLForSecurityApplicationGroupIdentifier:kWidgetAppGroupIdentifier];
  return containerURL ? [containerURL URLByAppendingPathComponent:kWidgetSnapshotFileName] : nil;
}

- (void)writeWidgetSnapshotForState:(NSDictionary *)state
{
  NSURL *snapshotURL = [self widgetSnapshotURL];
  if (!snapshotURL || !state) return;
  NSMutableDictionary *widgets = [NSMutableDictionary dictionary];
  for (NSDictionary *descriptor in [self widgetKindDescriptors]) {
    NSString *kind = descriptor[@"id"];
    widgets[kind] = @{
      @"kind": kind,
      @"title": descriptor[@"title"] ?: @"",
      @"subtitle": descriptor[@"subtitle"] ?: @"",
      @"summary": [self widgetSummaryForKind:kind state:state] ?: @"",
      @"page": descriptor[@"page"] ?: @"",
      @"action": descriptor[@"action"] ?: @"",
      @"launchURL": [[self launchURLForPage:descriptor[@"page"] action:descriptor[@"action"] source:kWidgetLaunchSource kind:kind] absoluteString] ?: @"",
    };
  }
  NSDictionary *payload = @{@"generatedAt": [self isoNow] ?: @"", @"widgets": widgets};
  NSError *directoryError = nil;
  if (![self ensureDirectoryAtPath:snapshotURL.URLByDeletingLastPathComponent.path error:&directoryError]) return;
  NSError *writeError = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:NSJSONWritingPrettyPrinted error:&writeError];
  if (!data || writeError) return;
  [data writeToURL:snapshotURL options:NSDataWritingAtomic error:&writeError];
}

- (void)reloadWidgetsIfSupportedForState:(NSDictionary *)state
{
  if (state) [self writeWidgetSnapshotForState:state];
#if __has_include(<WidgetKit/WidgetKit.h>)
  if (@available(iOS 14.0, *)) {
    [[WidgetCenter sharedWidgetCenter] reloadAllTimelines];
  }
#endif
}

- (void)reloadWidgetsIfSupported
{
  [self reloadWidgetsIfSupportedForState:[self loadBundleState]];
}

- (NSString *)notificationIdentifierForKey:(NSString *)key
{
  NSString *safeKey = ControlerTrimmedString(key);
  if (safeKey.length == 0) safeKey = [NSUUID UUID].UUIDString;
  NSCharacterSet *allowedCharacters = [NSCharacterSet characterSetWithCharactersInString:@"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.:"];
  NSMutableString *normalized = [NSMutableString string];
  for (NSUInteger index = 0; index < safeKey.length; index += 1) {
    unichar character = [safeKey characterAtIndex:index];
    if ([allowedCharacters characterIsMember:character]) [normalized appendFormat:@"%C", character];
    else [normalized appendString:@"_"];
  }
  return [kReminderNotificationPrefix stringByAppendingString:(normalized.length > 0 ? normalized : [NSUUID UUID].UUIDString)];
}

- (NSArray<NSDictionary *> *)normalizedReminderEntriesFromPayload:(NSDictionary *)payload
{
  NSMutableArray<NSDictionary *> *entries = [NSMutableArray array];
  NSArray *sourceEntries = ControlerEnsureArray(ControlerEnsureDictionary(payload)[@"entries"]);
  for (id entryValue in sourceEntries) {
    NSDictionary *entry = ControlerEnsureDictionary(entryValue);
    NSString *key = ControlerTrimmedString(entry[@"key"]);
    NSNumber *timestampNumber = [entry[@"reminderAt"] respondsToSelector:@selector(doubleValue)] ? @([entry[@"reminderAt"] doubleValue]) : nil;
    double reminderAtMs = timestampNumber ? [timestampNumber doubleValue] : 0.0;
    if (key.length == 0 || !isfinite(reminderAtMs) || reminderAtMs <= 0.0) continue;
    [entries addObject:@{
      @"key": key,
      @"identifier": [self notificationIdentifierForKey:key],
      @"title": ControlerTrimmedString(entry[@"title"]).length > 0 ? ControlerTrimmedString(entry[@"title"]) : @"提醒",
      @"message": ControlerTrimmedString(entry[@"message"]),
      @"reminderAt": @((long long)llround(reminderAtMs)),
      @"page": ControlerTrimmedString(entry[@"page"]),
      @"action": ControlerTrimmedString(entry[@"action"]),
      @"source": ControlerTrimmedString(entry[@"source"]),
      @"payload": ControlerDeepCopyJSON(ControlerEnsureDictionary(entry[@"payload"])) ?: @{},
    }];
  }
  [entries sortUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) {
    long long leftTime = [left[@"reminderAt"] longLongValue];
    long long rightTime = [right[@"reminderAt"] longLongValue];
    if (leftTime < rightTime) return NSOrderedAscending;
    if (leftTime > rightTime) return NSOrderedDescending;
    return [ControlerTrimmedString(left[@"key"]) compare:ControlerTrimmedString(right[@"key"])];
  }];
  if (entries.count > 60) {
    return [entries subarrayWithRange:NSMakeRange(0, 60)];
  }
  return entries;
}

- (NSArray<NSString *> *)defaultChangedSections
{
  return @[@"core", @"records", @"plans", @"todos", @"checkinItems", @"dailyCheckins", @"checkins", @"diaryEntries", @"diaryCategories", @"plansRecurring"];
}

- (NSString *)normalizedImportModeFromOptions:(NSDictionary *)options
{
  NSString *mode = [[ControlerTrimmedString(ControlerEnsureDictionary(options)[@"mode"]) lowercaseString] copy];
  if ([mode isEqualToString:@"diff"] || [mode isEqualToString:@"merge"]) return mode;
  return @"replace";
}

- (BOOL)isPartitionEnvelopePayload:(NSDictionary *)payload
{
  NSString *section = ControlerTrimmedString(payload[@"section"]);
  NSString *periodId = [self normalizedPeriodId:payload[@"periodId"]];
  return [ControlerPartitionedSections() containsObject:section] && periodId.length > 0 && [payload[@"items"] isKindOfClass:[NSArray class]];
}

- (NSDictionary *)mergedImportedState:(NSDictionary *)importedState withCurrentState:(NSDictionary *)currentState
{
  NSDictionary *normalizedCurrent = [self normalizedState:currentState touchModified:NO touchSyncSave:NO];
  NSDictionary *normalizedImported = [self normalizedState:importedState touchModified:NO touchSyncSave:NO];
  NSMutableDictionary *next = [normalizedCurrent mutableCopy];
  for (NSString *key in @[@"projects", @"todos", @"checkinItems", @"yearlyGoals", @"diaryCategories", @"guideState", @"customThemes", @"builtInThemeOverrides", @"selectedTheme", @"createdAt"]) {
    if (normalizedImported[key]) next[key] = ControlerDeepCopyJSON(normalizedImported[key]) ?: normalizedImported[key];
  }
  for (NSString *section in ControlerPartitionedSections()) {
    next[section] = [self mergeItemsForSection:section existingItems:ControlerEnsureArray(normalizedCurrent[section]) incomingItems:ControlerEnsureArray(normalizedImported[section]) mode:@"merge"];
  }
  return [self normalizedState:next touchModified:NO touchSyncSave:NO];
}

- (NSString *)resolvedExtractedBundleRootAtDirectory:(NSString *)directory
{
  if (directory.length == 0) return directory;
  NSString *directManifest = [directory stringByAppendingPathComponent:kBundleManifestFileName];
  if ([[self fileManager] fileExistsAtPath:directManifest]) return directory;
  for (NSString *childName in [[self fileManager] contentsOfDirectoryAtPath:directory error:nil]) {
    NSString *childPath = [directory stringByAppendingPathComponent:childName];
    BOOL isDirectory = NO;
    if (![[self fileManager] fileExistsAtPath:childPath isDirectory:&isDirectory] || !isDirectory) continue;
    if ([[self fileManager] fileExistsAtPath:[childPath stringByAppendingPathComponent:kBundleManifestFileName]]) return childPath;
  }
  return directory;
}

- (NSDictionary *)loadBundleSnapshotFromDirectory:(NSString *)directory error:(NSError **)error
{
  NSString *bundleRoot = [self resolvedExtractedBundleRootAtDirectory:directory];
  NSDictionary *manifest = [self normalizedManifest:[self jsonObjectFromFile:[bundleRoot stringByAppendingPathComponent:kBundleManifestFileName] fallback:nil]];
  if (!manifest) {
    if (error) *error = [self bridgeErrorWithDescription:@"ZIP 中缺少可用的 bundle-manifest.json。" code:1007];
    return nil;
  }
  NSMutableDictionary *partitionMap = [NSMutableDictionary dictionary];
  NSDictionary *sections = ControlerEnsureDictionary(manifest[@"sections"]);
  for (NSString *section in ControlerPartitionedSections()) {
    NSMutableDictionary *sectionBuckets = [NSMutableDictionary dictionary];
    for (id partitionValue in ControlerEnsureArray(ControlerEnsureDictionary(sections[section])[@"partitions"])) {
      NSDictionary *partition = ControlerEnsureDictionary(partitionValue);
      NSString *periodId = [self normalizedPeriodId:partition[@"periodId"]];
      NSString *file = ControlerOptionalTrimmedString(partition[@"file"]);
      if (periodId.length == 0 || file.length == 0) continue;
      id object = [self jsonObjectFromFile:[bundleRoot stringByAppendingPathComponent:file] fallback:nil];
      if ([object isKindOfClass:[NSArray class]]) sectionBuckets[periodId] = ControlerDeepCopyJSON((NSArray *)object) ?: @[];
      else sectionBuckets[periodId] = ControlerDeepCopyJSON(ControlerEnsureArray(ControlerEnsureDictionary(object)[@"items"])) ?: @[];
    }
    partitionMap[section] = sectionBuckets;
  }
  return [self buildLegacyStateFromBundlePayload:@{@"manifest": manifest, @"core": ControlerEnsureDictionary([self jsonObjectFromFile:[bundleRoot stringByAppendingPathComponent:kBundleCoreFileName] fallback:@{}]), @"recurringPlans": ControlerEnsureArray([self jsonObjectFromFile:[bundleRoot stringByAppendingPathComponent:kBundleRecurringPlansFileName] fallback:@[]]), @"partitionMap": partitionMap}];
}

- (NSDictionary *)importStorageSourceFromURL:(NSURL *)url options:(NSDictionary *)options error:(NSError **)error
{
  NSString *filePath = url.path ?: @"";
  NSString *displayName = url.lastPathComponent ?: @"";
  NSString *importMode = [self normalizedImportModeFromOptions:options];
  NSDictionary *currentState = [self loadBundleState] ?: [self normalizedState:@{} touchModified:NO touchSyncSave:NO];

  if ([[[displayName pathExtension] lowercaseString] isEqualToString:@"zip"]) {
    NSString *requestRoot = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"order-import-%@", [NSUUID UUID].UUIDString]];
    NSString *zipPath = [requestRoot stringByAppendingPathComponent:@"bundle.zip"];
    NSString *unzipRoot = [requestRoot stringByAppendingPathComponent:@"unzipped"];
    NSDictionary *writtenState = nil;
    @try {
      if (![self ensureDirectoryAtPath:requestRoot error:error]) return nil;
      if (![self copyItemAtPath:filePath toPath:zipPath error:error]) return nil;
      if (![SSZipArchive unzipFileAtPath:zipPath toDestination:unzipRoot]) {
        if (error) *error = [self bridgeErrorWithDescription:@"解压 ZIP bundle 失败。" code:1008];
        return nil;
      }
      NSDictionary *importedState = [self loadBundleSnapshotFromDirectory:unzipRoot error:error];
      if (!importedState) return nil;
      NSDictionary *targetState = [importMode isEqualToString:@"diff"] ? [self mergedImportedState:importedState withCurrentState:currentState] : importedState;
      writtenState = [self writeBundleFromState:targetState legacyBackups:ControlerEnsureArray([self readManifest][@"legacyBackups"]) touchModified:YES touchSyncSave:YES error:error];
      if (!writtenState) {
        if (error && !*error) *error = [self bridgeErrorWithDescription:@"写入 ZIP 导入后的 iOS 数据失败。" code:1016];
        return nil;
      }
    } @finally {
      [[self fileManager] removeItemAtPath:requestRoot error:nil];
    }
    [self maybeRunAutoBackup];
    [self reloadWidgetsIfSupported];
    return @{@"ok": @YES, @"imported": @YES, @"type": @"zip", @"mode": importMode, @"changedSections": [self defaultChangedSections], @"changedPeriods": @{}, @"status": [self storageStatusForState:writtenState]};
  }

  NSData *inputData = [NSData dataWithContentsOfFile:filePath];
  if (inputData.length == 0) {
    if (error) *error = [self bridgeErrorWithDescription:@"导入文件为空。" code:1009];
    return nil;
  }
  NSError *parseError = nil;
  id parsedObject = [NSJSONSerialization JSONObjectWithData:inputData options:NSJSONReadingMutableContainers error:&parseError];
  if (parseError || ![parsedObject isKindOfClass:[NSDictionary class]]) {
    if (error) *error = parseError ?: [self bridgeErrorWithDescription:@"导入文件不是有效的 JSON 对象。" code:1010];
    return nil;
  }
  NSDictionary *parsedPayload = (NSDictionary *)parsedObject;

  if ([self isPartitionEnvelopePayload:parsedPayload]) {
    NSString *section = ControlerTrimmedString(parsedPayload[@"section"]);
    NSString *periodId = [self normalizedPeriodId:parsedPayload[@"periodId"]];
    NSArray *incomingItems = ControlerEnsureArray(parsedPayload[@"items"]);
    if (![self items:incomingItems belongToSection:section periodId:periodId]) {
      if (error) *error = [self bridgeErrorWithDescription:@"单分区 JSON 的 section 与 periodId 不匹配。" code:1011];
      return nil;
    }
    NSMutableDictionary *nextState = [[NSMutableDictionary alloc] initWithDictionary:currentState ?: @{}];
    NSMutableArray *remainingItems = [NSMutableArray array];
    NSMutableArray *existingItems = [NSMutableArray array];
    NSMutableArray *recurringPlans = [NSMutableArray array];
    for (id itemValue in ControlerEnsureArray(nextState[section])) {
      NSDictionary *item = ControlerEnsureDictionary(itemValue);
      if ([section isEqualToString:@"plans"] && [self isRecurringPlan:item]) {
        [recurringPlans addObject:ControlerDeepCopyJSON(itemValue) ?: itemValue];
        continue;
      }
      NSString *itemPeriodId = [self periodIdForSection:section item:item];
      if (itemPeriodId.length == 0) itemPeriodId = kUndatedPeriodId;
      if ([itemPeriodId isEqualToString:periodId]) [existingItems addObject:itemValue];
      else [remainingItems addObject:ControlerDeepCopyJSON(itemValue) ?: itemValue];
    }
    NSArray *mergedItems = [self mergeItemsForSection:section existingItems:existingItems incomingItems:incomingItems mode:[importMode isEqualToString:@"merge"] ? @"merge" : @"replace"];
    NSMutableArray *sectionItems = [NSMutableArray arrayWithArray:remainingItems];
    [sectionItems addObjectsFromArray:mergedItems];
    if ([section isEqualToString:@"plans"]) [sectionItems addObjectsFromArray:recurringPlans];
    nextState[section] = [self sortedItems:sectionItems forSection:section];
    NSDictionary *writtenState = [self writeBundleFromState:nextState legacyBackups:ControlerEnsureArray([self readManifest][@"legacyBackups"]) touchModified:YES touchSyncSave:YES error:error];
    if (!writtenState) {
      if (error && !*error) *error = [self bridgeErrorWithDescription:@"写入单分区导入后的 iOS 数据失败。" code:1017];
      return nil;
    }
    [self maybeRunAutoBackup];
    [self reloadWidgetsIfSupported];
    return @{@"ok": @YES, @"imported": @YES, @"type": @"partition", @"section": section, @"periodId": periodId, @"mode": [importMode isEqualToString:@"merge"] ? @"merge" : @"replace", @"changedSections": @[section], @"changedPeriods": @{section: @[periodId]}, @"status": [self storageStatusForState:writtenState]};
  }

  NSDictionary *validatedState = [self validatedStorageStateFromObject:parsedPayload error:error];
  if (!validatedState) return nil;
  NSDictionary *targetState = [importMode isEqualToString:@"diff"] ? [self mergedImportedState:validatedState withCurrentState:currentState] : validatedState;
  NSDictionary *writtenState = [self writeBundleFromState:targetState legacyBackups:ControlerEnsureArray([self readManifest][@"legacyBackups"]) touchModified:YES touchSyncSave:YES error:error];
  if (!writtenState) {
    if (error && !*error) *error = [self bridgeErrorWithDescription:@"写入整包导入后的 iOS 数据失败。" code:1018];
    return nil;
  }
  [self maybeRunAutoBackup];
  [self reloadWidgetsIfSupported];
  return @{@"ok": @YES, @"imported": @YES, @"type": @"legacy-state", @"mode": importMode, @"changedSections": [self defaultChangedSections], @"changedPeriods": @{}, @"status": [self storageStatusForState:writtenState]};
}

- (NSDictionary *)switchToStorageFileURL:(NSURL *)url displayName:(NSString *)displayName error:(NSError **)error
{
  NSDictionary *previousSelection = [self storedStorageSelection];
  NSError *currentError = nil;
  if (![self ensureStorageReady:&currentError]) currentError = nil;
  NSDictionary *currentState = [self loadBundleState] ?: [self normalizedState:@{} touchModified:NO touchSyncSave:NO];
  NSString *filePath = url.path ?: @"";
  if (filePath.length == 0) {
    if (error) *error = [self bridgeErrorWithDescription:@"无法解析所选 JSON 文件路径。" code:1012];
    return nil;
  }
  NSData *existingData = [NSData dataWithContentsOfFile:filePath];
  BOOL hasExistingData = existingData.length > 0;
  if (hasExistingData) {
    NSError *parseError = nil;
    id existingObject = [NSJSONSerialization JSONObjectWithData:existingData options:NSJSONReadingMutableContainers error:&parseError];
    if (parseError) {
      if (error) *error = parseError;
      return nil;
    }
    if (![self validatedStorageStateFromObject:existingObject error:error]) return nil;
  }
  NSError *saveSelectionError = nil;
  [self saveStoredStorageSelectionFromURL:url mode:kStorageModeFile displayName:displayName error:&saveSelectionError];
  if (saveSelectionError) {
    if (error) *error = saveSelectionError;
    return nil;
  }
  NSDictionary *writtenState = hasExistingData ? ([self loadBundleState] ?: currentState) : [self writeBundleFromState:currentState legacyBackups:nil touchModified:YES touchSyncSave:YES error:error];
  if (!writtenState) {
    [self restoreStoredStorageSelection:previousSelection];
    if (error && !*error) *error = [self bridgeErrorWithDescription:@"切换到外部 JSON 存储后载入数据失败。" code:1019];
    return nil;
  }
  [self maybeRunAutoBackup];
  [self reloadWidgetsIfSupported];
  NSMutableDictionary *status = [[self storageStatusForState:writtenState] mutableCopy];
  status[@"switchAction"] = hasExistingData ? kStorageSwitchActionAdoptedExisting : kStorageSwitchActionSeededCurrent;
  return status;
}

- (NSDictionary *)switchToStorageDirectoryURL:(NSURL *)url displayName:(NSString *)displayName error:(NSError **)error
{
  NSDictionary *previousSelection = [self storedStorageSelection];
  NSError *currentError = nil;
  if (![self ensureStorageReady:&currentError]) currentError = nil;
  NSDictionary *currentState = [self loadBundleState] ?: [self normalizedState:@{} touchModified:NO touchSyncSave:NO];
  NSString *directoryPath = url.path ?: @"";
  if (directoryPath.length == 0) {
    if (error) *error = [self bridgeErrorWithDescription:@"无法解析所选目录路径。" code:1013];
    return nil;
  }
  BOOL hasManifest = [[self fileManager] fileExistsAtPath:[directoryPath stringByAppendingPathComponent:kBundleManifestFileName]];
  BOOL hasLegacyFile = !hasManifest && [[self fileManager] fileExistsAtPath:[directoryPath stringByAppendingPathComponent:kLegacyStorageFileName]];
  NSError *saveSelectionError = nil;
  [self saveStoredStorageSelectionFromURL:url mode:kStorageModeDirectory displayName:displayName error:&saveSelectionError];
  if (saveSelectionError) {
    if (error) *error = saveSelectionError;
    return nil;
  }
  NSDictionary *writtenState = nil;
  if (hasManifest || hasLegacyFile) {
    NSError *storageError = nil;
    if (![self ensureStorageReady:&storageError]) {
      [self restoreStoredStorageSelection:previousSelection];
      if (error) *error = storageError;
      return nil;
    }
    writtenState = [self loadBundleState];
  } else {
    writtenState = [self writeBundleFromState:currentState legacyBackups:nil touchModified:YES touchSyncSave:YES error:error];
  }
  if (!writtenState) {
    [self restoreStoredStorageSelection:previousSelection];
    if (error && !*error) *error = [self bridgeErrorWithDescription:@"切换到外部目录 bundle 后载入数据失败。" code:1020];
    return nil;
  }
  [self maybeRunAutoBackup];
  [self reloadWidgetsIfSupported];
  NSMutableDictionary *status = [[self storageStatusForState:writtenState] mutableCopy];
  status[@"switchAction"] = hasManifest ? kStorageSwitchActionAdoptedExisting : (hasLegacyFile ? kStorageSwitchActionMigratedLegacy : kStorageSwitchActionSeededCurrent);
  return status;
}

- (NSArray<NSString *> *)documentPickerLegacyTypesForContext:(NSDictionary *)context
{
  NSString *purpose = ControlerTrimmedString(context[@"purpose"]);
  if ([purpose isEqualToString:@"select-directory"]) return @[@"public.folder"];
  NSString *accept = ControlerTrimmedString(ControlerEnsureDictionary(context[@"options"])[@"accept"]);
  if ([accept isEqualToString:@"json"]) return @[@"public.json"];
  return @[@"public.json", @"com.pkware.zip-archive"];
}

- (void)resolvePendingDocumentPickerWithPayload:(NSDictionary *)payload
{
  RCTPromiseResolveBlock resolve = self.pendingDocumentPickerResolve;
  self.pendingDocumentPickerResolve = nil;
  self.pendingDocumentPickerReject = nil;
  self.pendingDocumentPickerContext = nil;
  if (resolve) resolve(payload ? [self serializeObject:payload] : nil);
}

- (void)rejectPendingDocumentPickerWithCode:(NSString *)code message:(NSString *)message error:(NSError *)error
{
  RCTPromiseRejectBlock reject = self.pendingDocumentPickerReject;
  self.pendingDocumentPickerResolve = nil;
  self.pendingDocumentPickerReject = nil;
  self.pendingDocumentPickerContext = nil;
  if (reject) reject(code, message, error);
}

- (void)presentDocumentPickerForContext:(NSDictionary *)context resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject
{
  if (self.pendingDocumentPickerResolve || self.pendingDocumentPickerReject) {
    reject(@"document_picker_busy", @"已有文档选择请求在进行中。", nil);
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *viewController = [self topViewController];
    if (!viewController) {
      reject(@"document_picker_unavailable", @"当前无法打开系统文档选择器。", nil);
      return;
    }

    UIDocumentPickerViewController *picker = nil;
#if __has_include(<UniformTypeIdentifiers/UniformTypeIdentifiers.h>)
    if (@available(iOS 14.0, *)) {
      NSString *purpose = ControlerTrimmedString(context[@"purpose"]);
      NSArray<UTType *> *types = nil;
      if ([purpose isEqualToString:@"select-directory"]) {
        types = @[UTTypeFolder];
      } else {
        NSString *accept = ControlerTrimmedString(ControlerEnsureDictionary(context[@"options"])[@"accept"]);
        types = [accept isEqualToString:@"json"] ? @[UTTypeJSON] : @[UTTypeJSON, UTTypeZIP];
      }
      picker = [[UIDocumentPickerViewController alloc] initForOpeningContentTypes:types asCopy:NO];
    }
#endif
    if (!picker) {
      picker = [[UIDocumentPickerViewController alloc] initWithDocumentTypes:[self documentPickerLegacyTypesForContext:context] inMode:UIDocumentPickerModeOpen];
    }

    picker.delegate = self;
    picker.allowsMultipleSelection = NO;
    self.pendingDocumentPickerResolve = resolve;
    self.pendingDocumentPickerReject = reject;
    self.pendingDocumentPickerContext = context ?: @{};
    [viewController presentViewController:picker animated:YES completion:nil];
  });
}

- (void)handlePickedDocumentURL:(NSURL *)url
{
  NSDictionary *context = self.pendingDocumentPickerContext ?: @{};
  NSString *purpose = ControlerTrimmedString(context[@"purpose"]);
  BOOL didAccess = [url startAccessingSecurityScopedResource];
  @try {
    NSError *error = nil;
    NSDictionary *payload = nil;
    if ([purpose isEqualToString:@"import-source"]) {
      payload = [self importStorageSourceFromURL:url options:ControlerEnsureDictionary(context[@"options"]) error:&error];
    } else if ([purpose isEqualToString:@"select-file"]) {
      payload = [self switchToStorageFileURL:url displayName:(url.lastPathComponent ?: @"controler-data.json") error:&error];
    } else if ([purpose isEqualToString:@"select-directory"]) {
      payload = [self switchToStorageDirectoryURL:url displayName:(url.lastPathComponent ?: @"已选择目录") error:&error];
    } else {
      error = [self bridgeErrorWithDescription:@"未知的 iOS 文档选择上下文。" code:1014];
    }
    if (error) {
      [self rejectPendingDocumentPickerWithCode:@"document_picker_failed" message:error.localizedDescription error:error];
      return;
    }
    [self resolvePendingDocumentPickerWithPayload:payload];
  } @finally {
    if (didAccess) [url stopAccessingSecurityScopedResource];
  }
}

- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)controller
{
  [self resolvePendingDocumentPickerWithPayload:nil];
}

- (void)documentPicker:(UIDocumentPickerViewController *)controller didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls
{
  NSURL *targetURL = urls.firstObject;
  if (!targetURL) {
    [self resolvePendingDocumentPickerWithPayload:nil];
    return;
  }
  [self handlePickedDocumentURL:targetURL];
}

- (void)documentPicker:(UIDocumentPickerViewController *)controller didPickDocumentAtURL:(NSURL *)url
{
  if (!url) {
    [self resolvePendingDocumentPickerWithPayload:nil];
    return;
  }
  [self handlePickedDocumentURL:url];
}

RCT_REMAP_METHOD(getStartUrl,
                 getStartUrlWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *resourcePath = [[NSBundle mainBundle].resourcePath stringByAppendingPathComponent:@"controler-web/index.html"];
  if (![[self fileManager] fileExistsAtPath:resourcePath]) {
    reject(@"start_url_missing", @"无法找到 iOS 离线 Web 资源。", nil);
    return;
  }
  resolve([[NSURL fileURLWithPath:resourcePath] absoluteString]);
}

RCT_REMAP_METHOD(getUiLanguage,
                 getUiLanguageWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve([self storedUiLanguage]);
}

RCT_REMAP_METHOD(setUiLanguage,
                 setUiLanguageWithValue:(NSString *)language
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve([self persistUiLanguage:language]);
}

RCT_REMAP_METHOD(readStorageState,
                 readStorageStateWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![self ensureStorageReady:&error]) {
    reject(@"storage_read_failed", error.localizedDescription, error);
    return;
  }
  NSDictionary *state = [self loadBundleState] ?: [self normalizedState:@{} touchModified:NO touchSyncSave:NO];
  resolve([self serializeObject:@{@"state": state, @"status": [self storageStatusForState:state]}]);
}

RCT_REMAP_METHOD(writeStorageState,
                 writeStorageStateWithJson:(NSString *)stateJson
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *storageError = nil;
  if (![self ensureStorageReady:&storageError]) {
    reject(@"storage_write_failed", storageError.localizedDescription, storageError);
    return;
  }
  NSData *inputData = [ControlerTrimmedString(stateJson) dataUsingEncoding:NSUTF8StringEncoding];
  NSError *parseError = nil;
  id object = inputData.length > 0
      ? [NSJSONSerialization JSONObjectWithData:inputData options:NSJSONReadingMutableContainers error:&parseError]
      : @{};
  if (parseError) {
    reject(@"storage_write_failed", @"解析 iOS 存储数据失败。", parseError);
    return;
  }
  NSError *validationError = nil;
  NSDictionary *validatedState = [self validatedStorageStateFromObject:object error:&validationError];
  if (!validatedState) {
    reject(@"storage_write_failed", validationError.localizedDescription, validationError);
    return;
  }
  NSError *writeError = nil;
  NSDictionary *writtenState = [self writeBundleFromState:validatedState legacyBackups:ControlerEnsureArray([self readManifest][@"legacyBackups"]) touchModified:YES touchSyncSave:YES error:&writeError];
  if (!writtenState) {
    reject(@"storage_write_failed", @"写入 iOS bundle 存储失败。", writeError);
    return;
  }
  [self maybeRunAutoBackup];
  resolve([self serializeObject:@{@"state": writtenState, @"status": [self storageStatusForState:writtenState]}]);
}

RCT_REMAP_METHOD(getStorageStatus,
                 getStorageStatusWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![self ensureStorageReady:&error]) {
    reject(@"storage_status_failed", error.localizedDescription, error);
    return;
  }
  NSDictionary *state = [self loadBundleState] ?: [self normalizedState:@{} touchModified:NO touchSyncSave:NO];
  resolve([self serializeObject:[self storageStatusForState:state]]);
}

RCT_REMAP_METHOD(getStorageManifest,
                 getStorageManifestWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![self ensureStorageReady:&error]) {
    reject(@"storage_manifest_failed", error.localizedDescription, error);
    return;
  }
  resolve([self serializeObject:[self readManifest] ?: @{}]);
}

RCT_REMAP_METHOD(getStorageCoreState,
                 getStorageCoreStateWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![self ensureStorageReady:&error]) {
    reject(@"storage_core_failed", error.localizedDescription, error);
    return;
  }
  resolve([self serializeObject:[self coreStatePayload]]);
}

RCT_REMAP_METHOD(getStoragePlanBootstrapState,
                 getStoragePlanBootstrapStateWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  if (![self ensureStorageReady:&error]) {
    reject(@"storage_plan_bootstrap_failed", error.localizedDescription, error);
    return;
  }
  resolve([self serializeObject:[self planBootstrapPayload]]);
}

RCT_REMAP_METHOD(loadStorageSectionRange,
                 loadStorageSectionRangeForSection:(NSString *)section
                 scopeJson:(NSString *)scopeJson
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *normalizedSection = ControlerTrimmedString(section);
  if (![ControlerPartitionedSections() containsObject:normalizedSection]) {
    reject(@"storage_range_load_failed", @"不支持的存储分区。", nil);
    return;
  }
  NSError *storageError = nil;
  if (![self ensureStorageReady:&storageError]) {
    reject(@"storage_range_load_failed", storageError.localizedDescription, storageError);
    return;
  }
  NSData *scopeData = [ControlerTrimmedString(scopeJson) dataUsingEncoding:NSUTF8StringEncoding];
  NSError *parseError = nil;
  id scopeObject = scopeData.length > 0 ? [NSJSONSerialization JSONObjectWithData:scopeData options:NSJSONReadingMutableContainers error:&parseError] : @{};
  if (parseError || ![scopeObject isKindOfClass:[NSDictionary class]]) {
    reject(@"storage_range_load_failed", @"解析分区范围失败。", parseError);
    return;
  }
  NSDictionary *range = [self normalizedRangeFromScope:ControlerEnsureDictionary(scopeObject)];
  NSSet<NSString *> *requestedPeriodIds = [NSSet setWithArray:ControlerEnsureArray(range[@"periodIds"])];
  NSDictionary *manifest = [self readManifest] ?: @{};
  NSDictionary *sectionManifest = ControlerEnsureDictionary(ControlerEnsureDictionary(manifest[@"sections"])[normalizedSection]);
  NSMutableArray *matchedPartitions = [NSMutableArray array], *items = [NSMutableArray array];
  for (id partitionValue in ControlerEnsureArray(sectionManifest[@"partitions"])) {
    NSDictionary *partition = ControlerEnsureDictionary(partitionValue);
    NSString *periodId = [self normalizedPeriodId:partition[@"periodId"]];
    if (requestedPeriodIds.count > 0 && ![requestedPeriodIds containsObject:periodId]) continue;
    if (periodId.length == 0) continue;
    [matchedPartitions addObject:partition];
    [items addObjectsFromArray:ControlerEnsureArray([self readPartitionEnvelopeForSection:normalizedSection periodId:periodId][@"items"])];
  }
  resolve([self serializeObject:@{@"section": normalizedSection, @"periodUnit": kPeriodUnit, @"periodIds": requestedPeriodIds.count > 0 ? [[requestedPeriodIds allObjects] sortedArrayUsingSelector:@selector(compare:)] : [matchedPartitions valueForKey:@"periodId"] ?: @[], @"startDate": range[@"startDate"] ?: [NSNull null], @"endDate": range[@"endDate"] ?: [NSNull null], @"items": [self sortedItems:items forSection:normalizedSection], @"manifestPartitions": matchedPartitions}]);
}

RCT_REMAP_METHOD(saveStorageSectionRange,
                 saveStorageSectionRangeForSection:(NSString *)section
                 payloadJson:(NSString *)payloadJson
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *normalizedSection = ControlerTrimmedString(section);
  if (![ControlerPartitionedSections() containsObject:normalizedSection]) {
    reject(@"storage_range_save_failed", @"不支持的存储分区。", nil);
    return;
  }
  NSError *storageError = nil;
  if (![self ensureStorageReady:&storageError]) {
    reject(@"storage_range_save_failed", storageError.localizedDescription, storageError);
    return;
  }
  NSData *payloadData = [ControlerTrimmedString(payloadJson) dataUsingEncoding:NSUTF8StringEncoding];
  NSError *parseError = nil;
  id payloadObject = payloadData.length > 0 ? [NSJSONSerialization JSONObjectWithData:payloadData options:NSJSONReadingMutableContainers error:&parseError] : @{};
  if (parseError || ![payloadObject isKindOfClass:[NSDictionary class]]) {
    reject(@"storage_range_save_failed", @"解析分区写入数据失败。", parseError);
    return;
  }
  NSDictionary *payload = ControlerEnsureDictionary(payloadObject);
  NSString *periodId = [self normalizedPeriodId:payload[@"periodId"]];
  NSArray *incomingItems = ControlerEnsureArray(payload[@"items"]);
  if (periodId.length == 0 || ![self items:incomingItems belongToSection:normalizedSection periodId:periodId]) {
    reject(@"storage_range_save_failed", @"分区内容与目标月份不一致。", nil);
    return;
  }
  NSMutableDictionary *state = [[NSMutableDictionary alloc] initWithDictionary:([self loadBundleState] ?: @{})];
  NSMutableArray *remainingItems = [NSMutableArray array], *existingItems = [NSMutableArray array], *recurringPlans = [NSMutableArray array];
  for (id itemValue in ControlerEnsureArray(state[normalizedSection])) {
    NSDictionary *item = ControlerEnsureDictionary(itemValue);
    if ([normalizedSection isEqualToString:@"plans"] && [self isRecurringPlan:item]) {
      [recurringPlans addObject:ControlerDeepCopyJSON(itemValue) ?: itemValue];
      continue;
    }
    NSString *itemPeriodId = [self periodIdForSection:normalizedSection item:item];
    if (itemPeriodId.length == 0) itemPeriodId = kUndatedPeriodId;
    if ([itemPeriodId isEqualToString:periodId]) [existingItems addObject:itemValue];
    else [remainingItems addObject:ControlerDeepCopyJSON(itemValue) ?: itemValue];
  }
  NSArray *mergedItems = [self mergeItemsForSection:normalizedSection existingItems:existingItems incomingItems:incomingItems mode:ControlerTrimmedString(payload[@"mode"])];
  NSMutableArray *nextItems = [NSMutableArray arrayWithArray:remainingItems];
  [nextItems addObjectsFromArray:mergedItems];
  if ([normalizedSection isEqualToString:@"plans"]) [nextItems addObjectsFromArray:recurringPlans];
  state[normalizedSection] = [self sortedItems:nextItems forSection:normalizedSection];
  NSError *writeError = nil;
  if (![self writeBundleFromState:state legacyBackups:ControlerEnsureArray([self readManifest][@"legacyBackups"]) touchModified:YES touchSyncSave:YES error:&writeError]) {
    reject(@"storage_range_save_failed", @"写入分区文件失败。", writeError);
    return;
  }
  [self maybeRunAutoBackup];
  resolve([self serializeObject:@{@"section": normalizedSection, @"periodId": periodId, @"count": @(mergedItems.count)}]);
}

RCT_REMAP_METHOD(replaceStorageCoreState,
                 replaceStorageCoreStateWithJson:(NSString *)partialCoreJson
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *storageError = nil;
  if (![self ensureStorageReady:&storageError]) {
    reject(@"storage_core_replace_failed", storageError.localizedDescription, storageError);
    return;
  }
  NSData *partialCoreData = [ControlerTrimmedString(partialCoreJson) dataUsingEncoding:NSUTF8StringEncoding];
  NSError *parseError = nil;
  id partialCoreObject = partialCoreData.length > 0 ? [NSJSONSerialization JSONObjectWithData:partialCoreData options:NSJSONReadingMutableContainers error:&parseError] : @{};
  if (parseError || ![partialCoreObject isKindOfClass:[NSDictionary class]]) {
    reject(@"storage_core_replace_failed", @"解析核心状态失败。", parseError);
    return;
  }
  NSMutableDictionary *state = [[NSMutableDictionary alloc] initWithDictionary:([self loadBundleState] ?: @{})];
  NSDictionary *partialCore = ControlerEnsureDictionary(partialCoreObject);
  for (NSString *key in ControlerCoreSectionKeys()) if (partialCore[key]) state[key] = ControlerDeepCopyJSON(partialCore[key]) ?: partialCore[key];
  NSError *writeError = nil;
  if (![self writeBundleFromState:state legacyBackups:ControlerEnsureArray([self readManifest][@"legacyBackups"]) touchModified:YES touchSyncSave:YES error:&writeError]) {
    reject(@"storage_core_replace_failed", @"替换核心状态失败。", writeError);
    return;
  }
  [self maybeRunAutoBackup];
  resolve([self serializeObject:[self coreStatePayload]]);
}

RCT_REMAP_METHOD(replaceStorageRecurringPlans,
                 replaceStorageRecurringPlansWithJson:(NSString *)itemsJson
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *storageError = nil;
  if (![self ensureStorageReady:&storageError]) {
    reject(@"storage_recurring_replace_failed", storageError.localizedDescription, storageError);
    return;
  }
  NSData *itemsData = [ControlerTrimmedString(itemsJson) dataUsingEncoding:NSUTF8StringEncoding];
  NSError *parseError = nil;
  id itemsObject = itemsData.length > 0 ? [NSJSONSerialization JSONObjectWithData:itemsData options:NSJSONReadingMutableContainers error:&parseError] : @[];
  if (parseError || ![itemsObject isKindOfClass:[NSArray class]]) {
    reject(@"storage_recurring_replace_failed", @"解析重复计划失败。", parseError);
    return;
  }
  NSMutableArray *recurringPlans = [NSMutableArray array];
  for (id itemValue in ControlerEnsureArray(itemsObject)) if ([self isRecurringPlan:itemValue]) [recurringPlans addObject:ControlerDeepCopyJSON(itemValue) ?: itemValue];
  NSMutableDictionary *state = [[NSMutableDictionary alloc] initWithDictionary:([self loadBundleState] ?: @{})];
  NSMutableArray *oneTimePlans = [NSMutableArray array];
  for (id itemValue in ControlerEnsureArray(state[@"plans"])) if (![self isRecurringPlan:itemValue]) [oneTimePlans addObject:ControlerDeepCopyJSON(itemValue) ?: itemValue];
  [oneTimePlans addObjectsFromArray:recurringPlans];
  state[@"plans"] = [self sortedItems:oneTimePlans forSection:@"plans"];
  NSError *writeError = nil;
  if (![self writeBundleFromState:state legacyBackups:ControlerEnsureArray([self readManifest][@"legacyBackups"]) touchModified:YES touchSyncSave:YES error:&writeError]) {
    reject(@"storage_recurring_replace_failed", @"替换重复计划失败。", writeError);
    return;
  }
  [self maybeRunAutoBackup];
  resolve([self serializeObject:recurringPlans]);
}

RCT_REMAP_METHOD(probeStorageStateVersion,
                 probeStorageStateVersionWithFallbackHash:(BOOL)includeFallbackHash
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  [self ensureStorageReady:nil];
  resolve([self serializeObject:[self probeStorageVersionIncludeHash:includeFallbackHash]]);
}

RCT_REMAP_METHOD(getAutoBackupStatus,
                 getAutoBackupStatusWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve([self serializeObject:[self autoBackupStatusWithError:nil]]);
}

RCT_REMAP_METHOD(updateAutoBackupSettings,
                 updateAutoBackupSettingsWithJson:(NSString *)settingsJson
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSData *settingsData = [ControlerTrimmedString(settingsJson) dataUsingEncoding:NSUTF8StringEncoding];
  NSError *parseError = nil;
  id settingsObject = settingsData.length > 0 ? [NSJSONSerialization JSONObjectWithData:settingsData options:NSJSONReadingMutableContainers error:&parseError] : @{};
  if (parseError || ![settingsObject isKindOfClass:[NSDictionary class]]) {
    reject(@"auto_backup_settings_failed", @"解析自动备份设置失败。", parseError);
    return;
  }
  [self saveAutoBackupSettings:ControlerEnsureDictionary(settingsObject)];
  resolve([self serializeObject:[self autoBackupStatusWithError:nil]]);
}

RCT_REMAP_METHOD(runAutoBackupNow,
                 runAutoBackupNowWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve([self serializeObject:[self executeAutoBackupForce:YES]]);
}

RCT_REMAP_METHOD(shareLatestBackup,
                 shareLatestBackupWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary *latest = [self listAutoBackupEntries].firstObject;
  NSString *latestPath = ControlerOptionalTrimmedString(latest[@"path"]);
  if (latestPath.length == 0 || ![[self fileManager] fileExistsAtPath:latestPath]) {
    resolve([self serializeObject:@{@"ok": @NO, @"shared": @NO, @"message": @"当前还没有可分享的备份文件。"}]);
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *viewController = [self topViewController];
    if (!viewController) {
      resolve([self serializeObject:@{@"ok": @NO, @"shared": @NO, @"message": @"当前无法打开分享面板。"}]);
      return;
    }
    UIActivityViewController *controller = [[UIActivityViewController alloc] initWithActivityItems:@[[NSURL fileURLWithPath:latestPath]] applicationActivities:nil];
    if (controller.popoverPresentationController) {
      controller.popoverPresentationController.sourceView = viewController.view;
      controller.popoverPresentationController.sourceRect = CGRectMake(CGRectGetMidX(viewController.view.bounds), CGRectGetMidY(viewController.view.bounds), 1, 1);
    }
    [viewController presentViewController:controller animated:YES completion:^{ resolve([self serializeObject:@{@"ok": @YES, @"shared": @YES, @"path": latestPath, @"message": @"已打开最新备份的分享面板。"}]); }];
  });
}

RCT_REMAP_METHOD(exportStorageBundle,
                 exportStorageBundleWithJson:(NSString *)optionsJson
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *storageError = nil;
  if (![self ensureStorageReady:&storageError]) {
    reject(@"storage_bundle_export_failed", storageError.localizedDescription, storageError);
    return;
  }

  NSData *optionsData = [ControlerTrimmedString(optionsJson) dataUsingEncoding:NSUTF8StringEncoding];
  NSError *parseError = nil;
  id optionsObject = optionsData.length > 0 ? [NSJSONSerialization JSONObjectWithData:optionsData options:NSJSONReadingMutableContainers error:&parseError] : @{};
  if (parseError || ![optionsObject isKindOfClass:[NSDictionary class]]) {
    reject(@"storage_bundle_export_failed", @"解析导出参数失败。", parseError);
    return;
  }

  NSDictionary *options = ControlerEnsureDictionary(optionsObject);
  NSString *exportType = [[ControlerTrimmedString(options[@"type"]) lowercaseString] copy];
  NSError *fileError = nil;

  if ([exportType isEqualToString:@"partition"]) {
    NSString *section = ControlerTrimmedString(options[@"section"]);
    NSString *periodId = [self normalizedPeriodId:options[@"periodId"]];
    if (![ControlerPartitionedSections() containsObject:section] || periodId.length == 0) {
      reject(@"storage_bundle_export_failed", @"导出单分区 JSON 缺少有效的 section 或 periodId。", nil);
      return;
    }
    NSDictionary *envelope = [self readPartitionEnvelopeForSection:section periodId:periodId];
    NSString *targetPath = [self temporaryExportPathWithExtension:@"json" preferredFileName:ControlerOptionalTrimmedString(options[@"fileName"])];
    [[self fileManager] removeItemAtPath:targetPath error:nil];
    if (![self writeJsonObject:envelope toFile:targetPath error:&fileError]) {
      reject(@"storage_bundle_export_failed", @"写入分区导出文件失败。", fileError);
      return;
    }
    [self presentShareControllerForPath:targetPath message:@"已打开分区 JSON 导出的分享面板。" resolver:resolve];
    return;
  }

  NSString *tempRoot = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"order-export-%@", [NSUUID UUID].UUIDString]];
  NSString *snapshotDirectory = [tempRoot stringByAppendingPathComponent:@"bundle"];
  NSString *zipPath = [self temporaryExportPathWithExtension:@"zip" preferredFileName:ControlerOptionalTrimmedString(options[@"fileName"])];
  [[self fileManager] removeItemAtPath:zipPath error:nil];
  if (![self ensureDirectoryAtPath:[self temporaryExportsDirectoryPath] error:&fileError] ||
      ![self writeBundleSnapshotToDirectory:snapshotDirectory error:&fileError] ||
      ![SSZipArchive createZipFileAtPath:zipPath withContentsOfDirectory:snapshotDirectory]) {
    [[self fileManager] removeItemAtPath:tempRoot error:nil];
    reject(@"storage_bundle_export_failed", @"创建 bundle ZIP 导出文件失败。", fileError);
    return;
  }
  [[self fileManager] removeItemAtPath:tempRoot error:nil];
  [self presentShareControllerForPath:zipPath message:@"已打开 bundle ZIP 导出的分享面板。" resolver:resolve];
}

RCT_REMAP_METHOD(importStorageSource,
                 importStorageSourceWithJson:(NSString *)optionsJson
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSData *optionsData = [ControlerTrimmedString(optionsJson) dataUsingEncoding:NSUTF8StringEncoding];
  NSError *parseError = nil;
  id optionsObject = optionsData.length > 0 ? [NSJSONSerialization JSONObjectWithData:optionsData options:NSJSONReadingMutableContainers error:&parseError] : @{};
  if (parseError || ![optionsObject isKindOfClass:[NSDictionary class]]) {
    reject(@"storage_import_failed", @"解析导入参数失败。", parseError);
    return;
  }

  NSDictionary *options = ControlerEnsureDictionary(optionsObject);
  NSString *filePath = ControlerOptionalTrimmedString(options[@"filePath"]);
  if (filePath.length > 0 && [[self fileManager] fileExistsAtPath:filePath]) {
    NSError *importError = nil;
    NSDictionary *payload = [self importStorageSourceFromURL:[NSURL fileURLWithPath:filePath] options:options error:&importError];
    if (importError) {
      reject(@"storage_import_failed", importError.localizedDescription, importError);
      return;
    }
    resolve([self serializeObject:payload]);
    return;
  }
  [self presentDocumentPickerForContext:@{@"purpose": @"import-source", @"options": options} resolver:resolve rejecter:reject];
}

RCT_REMAP_METHOD(inspectImportSourceFile,
                 inspectImportSourceFileWithJson:(NSString *)optionsJson
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  reject(@"storage_import_inspect_unavailable", @"当前 iOS 原生桥暂不支持外部 JSON 原生检查。", nil);
}

RCT_REMAP_METHOD(previewExternalImport,
                 previewExternalImportWithJson:(NSString *)optionsJson
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  reject(@"storage_import_preview_unavailable", @"当前 iOS 原生桥暂不支持外部 JSON 原生预览。", nil);
}

RCT_REMAP_METHOD(selectStorageFile,
                 selectStorageFileWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  [self presentDocumentPickerForContext:@{@"purpose": @"select-file"} resolver:resolve rejecter:reject];
}

RCT_REMAP_METHOD(selectStorageDirectory,
                 selectStorageDirectoryWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  [self presentDocumentPickerForContext:@{@"purpose": @"select-directory"} resolver:resolve rejecter:reject];
}

RCT_REMAP_METHOD(resetStorageFile,
                 resetStorageFileWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  [self restoreStoredStorageSelection:@{}];
  NSError *storageError = nil;
  if (![self ensureStorageReady:&storageError]) {
    reject(@"storage_reset_failed", storageError.localizedDescription, storageError);
    return;
  }
  NSDictionary *state = [self loadBundleState] ?: [self normalizedState:@{} touchModified:NO touchSyncSave:NO];
  [self reloadWidgetsIfSupported];
  resolve([self serializeObject:@{
    @"ok": @YES,
    @"supported": @YES,
    @"status": [self storageStatusForState:state],
    @"message": @"已切回 iOS 默认私有 bundle 存储。",
  }]);
}

RCT_REMAP_METHOD(consumeLaunchAction,
                 consumeLaunchActionWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDictionary *payload = ControlerConsumePendingLaunchAction();
  resolve([self serializeObject:(payload ?: @{@"hasAction": @NO, @"page": @"", @"action": @"", @"source": @"ios-app", @"payload": @{}})]);
}

RCT_REMAP_METHOD(requestPinWidget,
                 requestPinWidget:(NSString *)kind
                 widgetResolver:(RCTPromiseResolveBlock)resolve
                 widgetRejecter:(RCTPromiseRejectBlock)reject)
{
  resolve([self serializeObject:@{
    @"ok": @NO,
    @"supported": @YES,
    @"manual": @YES,
    @"message": @"iOS 端请通过系统小组件面板手动添加 WidgetKit 小组件。",
  }]);
}

RCT_REMAP_METHOD(getWidgetPinSupport,
                 getWidgetPinSupport:(NSString *)kind
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve([self serializeObject:@{
    @"ok": @YES,
    @"kind": ControlerTrimmedString(kind),
    @"supported": @YES,
    @"apiSupported": @NO,
    @"launcherSupported": @YES,
    @"canRequestPin": @NO,
    @"manualOnly": @YES,
    @"providerAvailable": @YES,
    @"reason": @"manual-add",
    @"message": @"iOS 端请通过系统小组件面板手动添加 WidgetKit 小组件。",
  }]);
}

RCT_REMAP_METHOD(consumePinWidgetResult,
                 consumePinWidgetResultWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve([self serializeObject:@{@"hasResult": @NO}]);
}

RCT_REMAP_METHOD(openHomeScreen,
                 openHomeScreenWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve([self serializeObject:@{
    @"ok": @NO,
    @"supported": @NO,
    @"message": @"iOS 不支持由应用主动跳回主屏幕。",
  }]);
}

RCT_REMAP_METHOD(refreshWidgets,
                 refreshWidgetsWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  [self reloadWidgetsIfSupported];
  resolve([self serializeObject:@{
    @"ok": @YES,
    @"supported": @YES,
    @"message": @"已触发 iOS WidgetKit 时间线刷新。",
  }]);
}

RCT_REMAP_METHOD(exportData,
                 exportData:(NSString *)stateJson
                 fileName:(NSString *)fileName
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSData *stateData = [ControlerTrimmedString(stateJson) dataUsingEncoding:NSUTF8StringEncoding];
  NSError *parseError = nil;
  id stateObject = stateData.length > 0 ? [NSJSONSerialization JSONObjectWithData:stateData options:NSJSONReadingMutableContainers error:&parseError] : @{};
  if (parseError || ![stateObject isKindOfClass:[NSDictionary class]]) {
    reject(@"storage_export_failed", @"解析导出的 JSON 数据失败。", parseError);
    return;
  }
  NSString *targetPath = [self temporaryExportPathWithExtension:@"json" preferredFileName:ControlerOptionalTrimmedString(fileName)];
  NSError *writeError = nil;
  [[self fileManager] removeItemAtPath:targetPath error:nil];
  if (![self writeJsonObject:stateObject toFile:targetPath error:&writeError]) {
    reject(@"storage_export_failed", @"写入 JSON 导出文件失败。", writeError);
    return;
  }
  [self presentShareControllerForPath:targetPath message:@"已打开 JSON 数据导出的分享面板。" resolver:resolve];
}

RCT_REMAP_METHOD(requestNotificationPermission,
                 requestNotificationPermission:(BOOL)interactive
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
    BOOL granted =
      settings.authorizationStatus == UNAuthorizationStatusAuthorized ||
      settings.authorizationStatus == UNAuthorizationStatusProvisional ||
      settings.authorizationStatus == UNAuthorizationStatusEphemeral;
    if (granted || !interactive || settings.authorizationStatus == UNAuthorizationStatusDenied) {
      resolve([self serializeObject:@{
        @"supported": @YES,
        @"granted": @(granted),
        @"asked": @NO,
      }]);
      return;
    }

    [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge)
                          completionHandler:^(BOOL accepted, NSError * _Nullable error) {
      if (error) {
        reject(@"notification_permission_failed", error.localizedDescription, error);
        return;
      }
      resolve([self serializeObject:@{
        @"supported": @YES,
        @"granted": @(accepted),
        @"asked": @YES,
      }]);
    }];
  }];
}

RCT_REMAP_METHOD(syncNotificationSchedule,
                 syncNotificationSchedule:(NSString *)payloadJson
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSData *payloadData = [ControlerTrimmedString(payloadJson) dataUsingEncoding:NSUTF8StringEncoding];
  NSError *parseError = nil;
  id payloadObject = payloadData.length > 0 ? [NSJSONSerialization JSONObjectWithData:payloadData options:NSJSONReadingMutableContainers error:&parseError] : @{};
  if (parseError || ![payloadObject isKindOfClass:[NSDictionary class]]) {
    reject(@"notification_schedule_sync_failed", @"解析提醒计划失败。", parseError);
    return;
  }

  NSArray<NSDictionary *> *entries = [self normalizedReminderEntriesFromPayload:ControlerEnsureDictionary(payloadObject)];
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [center getPendingNotificationRequestsWithCompletionHandler:^(NSArray<UNNotificationRequest *> *requests) {
    NSMutableArray<NSString *> *existingIdentifiers = [NSMutableArray array];
    for (UNNotificationRequest *request in requests) {
      if ([request.identifier hasPrefix:kReminderNotificationPrefix]) {
        [existingIdentifiers addObject:request.identifier];
      }
    }
    if (existingIdentifiers.count > 0) {
      [center removePendingNotificationRequestsWithIdentifiers:existingIdentifiers];
      [center removeDeliveredNotificationsWithIdentifiers:existingIdentifiers];
    }

    [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
      BOOL granted =
        settings.authorizationStatus == UNAuthorizationStatusAuthorized ||
        settings.authorizationStatus == UNAuthorizationStatusProvisional ||
        settings.authorizationStatus == UNAuthorizationStatusEphemeral;
      if (!granted) {
        resolve([self serializeObject:@{
          @"ok": @YES,
          @"supported": @YES,
          @"granted": @NO,
          @"scheduledCount": @0,
        }]);
        return;
      }

      dispatch_group_t group = dispatch_group_create();
      __block NSInteger scheduledCount = 0;
      NSDate *now = [NSDate date];
      for (NSDictionary *entry in entries) {
        long long reminderAtMs = [entry[@"reminderAt"] longLongValue];
        NSDate *fireDate = [NSDate dateWithTimeIntervalSince1970:(NSTimeInterval)reminderAtMs / 1000.0];
        if (!fireDate || [fireDate compare:now] != NSOrderedDescending) continue;

        UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
        content.title = ControlerTrimmedString(entry[@"title"]).length > 0 ? ControlerTrimmedString(entry[@"title"]) : @"提醒";
        content.body = ControlerTrimmedString(entry[@"message"]);
        content.sound = [UNNotificationSound defaultSound];
        content.userInfo = @{
          @"page": ControlerOptionalTrimmedString(entry[@"page"]) ?: @"",
          @"action": ControlerOptionalTrimmedString(entry[@"action"]) ?: @"",
          @"source": ControlerOptionalTrimmedString(entry[@"source"]) ?: @"",
          @"payload": ControlerDeepCopyJSON(ControlerEnsureDictionary(entry[@"payload"])) ?: @{},
        };

        NSDateComponents *components = [[NSCalendar currentCalendar] components:(NSCalendarUnitYear | NSCalendarUnitMonth | NSCalendarUnitDay | NSCalendarUnitHour | NSCalendarUnitMinute | NSCalendarUnitSecond) fromDate:fireDate];
        UNCalendarNotificationTrigger *trigger = [UNCalendarNotificationTrigger triggerWithDateMatchingComponents:components repeats:NO];
        UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:ControlerTrimmedString(entry[@"identifier"]) content:content trigger:trigger];
        dispatch_group_enter(group);
        [center addNotificationRequest:request withCompletionHandler:^(NSError * _Nullable error) {
          if (!error) scheduledCount += 1;
          else NSLog(@"[ControlerBridge] 添加 iOS 本地提醒失败: %@", error.localizedDescription);
          dispatch_group_leave(group);
        }];
      }

      dispatch_group_notify(group, dispatch_get_main_queue(), ^{
        resolve([self serializeObject:@{
          @"ok": @YES,
          @"supported": @YES,
          @"granted": @YES,
          @"scheduledCount": @(scheduledCount),
        }]);
      });
    }];
  }];
}

@end
