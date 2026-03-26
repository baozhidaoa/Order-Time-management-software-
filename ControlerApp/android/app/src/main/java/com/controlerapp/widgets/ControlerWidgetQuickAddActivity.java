package com.controlerapp.widgets;

import android.app.DatePickerDialog;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.TextUtils;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import com.controlerapp.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public final class ControlerWidgetQuickAddActivity extends AppCompatActivity {
    private static final String LOG_TAG = "ControlerWidget";
    private static final String[] WEEKDAY_LABELS =
        new String[] {"周日", "周一", "周二", "周三", "周四", "周五", "周六"};

    private String widgetKind = "";
    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private EditText nameInput = null;
    private Button cancelButton = null;
    private Button saveButton = null;
    private ProgressBar savingIndicator = null;
    private TextView titleView = null;
    private TextView detailView = null;
    private View quickAddCard = null;
    private View todoPriorityShell = null;
    private Button todoPriorityLowButton = null;
    private Button todoPriorityMediumButton = null;
    private Button todoPriorityHighButton = null;
    private View todoDueShell = null;
    private Button todoDueButton = null;
    private Button todoDueClearButton = null;
    private View checkinRepeatShell = null;
    private Button repeatDailyButton = null;
    private Button repeatWeeklyButton = null;
    private View checkinWeekdaysShell = null;
    private Button checkinWeekdaysButton = null;
    private View checkinEndDateShell = null;
    private Button checkinEndDateButton = null;
    private Button checkinEndDateClearButton = null;
    private volatile boolean saving = false;

    private int themedOutlineColor = Color.parseColor("#4F6B5D");
    private int themedFieldFillColor = Color.parseColor("#20362B");
    private int themedSurfaceColor = Color.parseColor("#20362B");
    private int themedBodyColor = Color.parseColor("#EAF6ED");
    private int themedSubtitleColor = Color.parseColor("#D2E4D7");
    private int themedAccentColor = Color.parseColor("#8ED6A4");
    private int themedAccentTextColor = Color.parseColor("#173326");

    private String todoPriority = "low";
    private String todoDueDate = "";
    private String checkinRepeatType = "daily";
    private final ArrayList<Integer> checkinRepeatWeekdays = new ArrayList<>();
    private String checkinEndDate = "";

    private interface DateSelectionCallback {
        void onDateSelected(String dateText);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.controler_widget_quick_add_activity);
        configureWindow();
        getWindow().setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE
                | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        );

        widgetKind = ControlerWidgetKinds.normalize(
            getIntent() == null
                ? ""
                : getIntent().getStringExtra(ControlerWidgetActionHandler.EXTRA_WIDGET_KIND)
        );
        appWidgetId =
            getIntent() == null
                ? AppWidgetManager.INVALID_APPWIDGET_ID
                : getIntent().getIntExtra(
                    ControlerWidgetActionHandler.EXTRA_APP_WIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID
                );

        if (
            !ControlerWidgetKinds.TODOS.equals(widgetKind)
                && !ControlerWidgetKinds.CHECKINS.equals(widgetKind)
        ) {
            finish();
            return;
        }

        titleView = findViewById(R.id.widget_quick_add_title);
        detailView = findViewById(R.id.widget_quick_add_detail);
        nameInput = findViewById(R.id.widget_quick_add_input);
        cancelButton = findViewById(R.id.widget_quick_add_cancel);
        saveButton = findViewById(R.id.widget_quick_add_save);
        savingIndicator = findViewById(R.id.widget_quick_add_progress);
        quickAddCard = findViewById(R.id.widget_quick_add_card);
        todoPriorityShell = findViewById(R.id.widget_quick_add_todo_priority_shell);
        todoPriorityLowButton = findViewById(R.id.widget_quick_add_todo_priority_low);
        todoPriorityMediumButton = findViewById(R.id.widget_quick_add_todo_priority_medium);
        todoPriorityHighButton = findViewById(R.id.widget_quick_add_todo_priority_high);
        todoDueShell = findViewById(R.id.widget_quick_add_todo_due_shell);
        todoDueButton = findViewById(R.id.widget_quick_add_todo_due_button);
        todoDueClearButton = findViewById(R.id.widget_quick_add_todo_due_clear);
        checkinRepeatShell = findViewById(R.id.widget_quick_add_checkin_repeat_shell);
        repeatDailyButton = findViewById(R.id.widget_quick_add_checkin_repeat_daily);
        repeatWeeklyButton = findViewById(R.id.widget_quick_add_checkin_repeat_weekly);
        checkinWeekdaysShell = findViewById(R.id.widget_quick_add_checkin_weekdays_shell);
        checkinWeekdaysButton = findViewById(R.id.widget_quick_add_checkin_weekdays_button);
        checkinEndDateShell = findViewById(R.id.widget_quick_add_checkin_end_date_shell);
        checkinEndDateButton = findViewById(R.id.widget_quick_add_checkin_end_date_button);
        checkinEndDateClearButton = findViewById(R.id.widget_quick_add_checkin_end_date_clear);

        initializeQuickAddState();
        applyThemePalette();

        final boolean isTodo = ControlerWidgetKinds.TODOS.equals(widgetKind);
        if (titleView != null) {
            titleView.setText(isTodo ? "新增待办事项" : "新增打卡项目");
        }
        if (detailView != null) {
            detailView.setText(
                isTodo
                    ? "输入名称后会直接保存到待办和小组件里，可选优先级和截止日期。"
                    : "输入名称后会直接保存到打卡列表和小组件里，可选重复方式和截止日期。"
            );
        }
        if (nameInput != null) {
            nameInput.setHint(isTodo ? "待办名称" : "打卡项目名称");
            nameInput.requestFocus();
            nameInput.setOnEditorActionListener((view, actionId, event) -> {
                boolean shouldSubmit =
                    actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE
                        || actionId == android.view.inputmethod.EditorInfo.IME_ACTION_GO
                        || (event != null
                            && event.getKeyCode() == KeyEvent.KEYCODE_ENTER
                            && event.getAction() == KeyEvent.ACTION_DOWN);
                if (!shouldSubmit) {
                    return false;
                }
                submitQuickAdd();
                return true;
            });
        }
        if (cancelButton != null) {
            cancelButton.setAllCaps(false);
            cancelButton.setOnClickListener(v -> finish());
        }
        if (saveButton != null) {
            saveButton.setAllCaps(false);
            saveButton.setOnClickListener(v -> submitQuickAdd());
        }

        bindKindSpecificActions(isTodo);
        refreshScheduleViews();
        overridePendingTransition(0, 0);
    }

    private void initializeQuickAddState() {
        todoPriority = "low";
        todoDueDate = "";
        checkinRepeatType = "daily";
        checkinEndDate = "";
        checkinRepeatWeekdays.clear();
        checkinRepeatWeekdays.addAll(buildDefaultWeeklyRepeat(todayText()));
    }

    private void bindKindSpecificActions(boolean isTodo) {
        if (todoPriorityShell != null) {
            todoPriorityShell.setVisibility(isTodo ? View.VISIBLE : View.GONE);
        }
        if (todoDueShell != null) {
            todoDueShell.setVisibility(isTodo ? View.VISIBLE : View.GONE);
        }
        if (checkinRepeatShell != null) {
            checkinRepeatShell.setVisibility(isTodo ? View.GONE : View.VISIBLE);
        }
        if (checkinEndDateShell != null) {
            checkinEndDateShell.setVisibility(isTodo ? View.GONE : View.VISIBLE);
        }

        if (todoPriorityLowButton != null) {
            todoPriorityLowButton.setAllCaps(false);
            todoPriorityLowButton.setOnClickListener(v -> {
                todoPriority = "low";
                refreshScheduleViews();
            });
        }
        if (todoPriorityMediumButton != null) {
            todoPriorityMediumButton.setAllCaps(false);
            todoPriorityMediumButton.setOnClickListener(v -> {
                todoPriority = "medium";
                refreshScheduleViews();
            });
        }
        if (todoPriorityHighButton != null) {
            todoPriorityHighButton.setAllCaps(false);
            todoPriorityHighButton.setOnClickListener(v -> {
                todoPriority = "high";
                refreshScheduleViews();
            });
        }
        if (todoDueButton != null) {
            todoDueButton.setAllCaps(false);
            todoDueButton.setOnClickListener(v -> openDatePickerDialog(todoDueDate, value -> {
                todoDueDate = safeText(value);
                refreshScheduleViews();
            }));
        }
        if (todoDueClearButton != null) {
            todoDueClearButton.setAllCaps(false);
            todoDueClearButton.setOnClickListener(v -> {
                todoDueDate = "";
                refreshScheduleViews();
            });
        }
        if (repeatDailyButton != null) {
            repeatDailyButton.setAllCaps(false);
            repeatDailyButton.setOnClickListener(v -> {
                checkinRepeatType = "daily";
                refreshScheduleViews();
            });
        }
        if (repeatWeeklyButton != null) {
            repeatWeeklyButton.setAllCaps(false);
            repeatWeeklyButton.setOnClickListener(v -> {
                checkinRepeatType = "weekly";
                if (checkinRepeatWeekdays.isEmpty()) {
                    checkinRepeatWeekdays.addAll(buildDefaultWeeklyRepeat(todayText()));
                }
                refreshScheduleViews();
            });
        }
        if (checkinWeekdaysButton != null) {
            checkinWeekdaysButton.setAllCaps(false);
            checkinWeekdaysButton.setOnClickListener(v -> openWeekdayPickerDialog());
        }
        if (checkinEndDateButton != null) {
            checkinEndDateButton.setAllCaps(false);
            checkinEndDateButton.setOnClickListener(v -> openDatePickerDialog(checkinEndDate, value -> {
                checkinEndDate = safeText(value);
                refreshScheduleViews();
            }));
        }
        if (checkinEndDateClearButton != null) {
            checkinEndDateClearButton.setAllCaps(false);
            checkinEndDateClearButton.setOnClickListener(v -> {
                checkinEndDate = "";
                refreshScheduleViews();
            });
        }
    }

    private void submitQuickAdd() {
        if (saving || nameInput == null) {
            return;
        }
        final String title = String.valueOf(nameInput.getText()).trim();
        if (TextUtils.isEmpty(title)) {
            nameInput.setError("请输入名称");
            nameInput.requestFocus();
            return;
        }

        if (
            ControlerWidgetKinds.CHECKINS.equals(widgetKind)
                && !TextUtils.isEmpty(checkinEndDate)
                && checkinEndDate.compareTo(todayText()) < 0
        ) {
            Toast.makeText(this, "截止日期不能早于今天。", Toast.LENGTH_SHORT).show();
            return;
        }

        setSaving(true);
        new Thread(() -> {
            long startedAtMs = SystemClock.elapsedRealtime();
            try {
                final boolean isTodoWidget = ControlerWidgetKinds.TODOS.equals(widgetKind);
                if (isTodoWidget) {
                    saveTodo(title);
                } else {
                    saveCheckin(title);
                }
                runOnUiThread(() -> {
                    Toast.makeText(
                        getApplicationContext(),
                        isTodoWidget ? "待办已创建" : "打卡项目已创建",
                        Toast.LENGTH_SHORT
                    ).show();
                    finish();
                });
                ControlerWidgetActionHandler.emitStorageChangedToForeground(
                    getApplicationContext(),
                    new String[] {isTodoWidget ? "todos" : "checkinItems"},
                    null,
                    "android-widget-quick-add"
                );
                refreshTargetWidgets();
                Log.d(
                    LOG_TAG,
                    "quickAddSaved kind="
                        + widgetKind
                        + " appWidgetId="
                        + appWidgetId
                        + " durationMs="
                        + Math.max(0L, SystemClock.elapsedRealtime() - startedAtMs)
                );
            } catch (Exception error) {
                error.printStackTrace();
                runOnUiThread(() -> {
                    setSaving(false);
                    Toast.makeText(this, "保存失败，请稍后重试。", Toast.LENGTH_SHORT).show();
                });
            }
        }).start();
    }

    private void setSaving(boolean nextSaving) {
        saving = nextSaving;
        if (nameInput != null) {
            nameInput.setEnabled(!nextSaving);
        }
        if (cancelButton != null) {
            cancelButton.setEnabled(!nextSaving);
        }
        if (saveButton != null) {
            saveButton.setEnabled(!nextSaving);
            saveButton.setText(nextSaving ? "保存中..." : "保存");
        }
        setButtonEnabled(todoPriorityLowButton, !nextSaving);
        setButtonEnabled(todoPriorityMediumButton, !nextSaving);
        setButtonEnabled(todoPriorityHighButton, !nextSaving);
        setButtonEnabled(todoDueButton, !nextSaving);
        setButtonEnabled(todoDueClearButton, !nextSaving);
        setButtonEnabled(repeatDailyButton, !nextSaving);
        setButtonEnabled(repeatWeeklyButton, !nextSaving);
        setButtonEnabled(checkinWeekdaysButton, !nextSaving);
        setButtonEnabled(checkinEndDateButton, !nextSaving);
        setButtonEnabled(checkinEndDateClearButton, !nextSaving);
        if (savingIndicator != null) {
            savingIndicator.setVisibility(nextSaving ? View.VISIBLE : View.GONE);
        }
    }

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(0, 0);
    }

    private void configureWindow() {
        Window window = getWindow();
        if (window == null) {
            return;
        }
        window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        window.setGravity(Gravity.CENTER);
        window.getDecorView().setPadding(0, 0, 0, 0);
        int sideMarginPx = dpToPx(12f);
        int minWidthPx = dpToPx(300f);
        int maxWidthPx = dpToPx(360f);
        int screenWidthPx = Math.max(getResources().getDisplayMetrics().widthPixels, minWidthPx);
        int resolvedWidthPx = Math.max(
            minWidthPx,
            Math.min(maxWidthPx, Math.max(minWidthPx, screenWidthPx - sideMarginPx * 2))
        );
        window.setLayout(resolvedWidthPx, WindowManager.LayoutParams.WRAP_CONTENT);
        WindowManager.LayoutParams attributes = window.getAttributes();
        attributes.gravity = Gravity.CENTER;
        attributes.width = resolvedWidthPx;
        attributes.height = WindowManager.LayoutParams.WRAP_CONTENT;
        attributes.x = 0;
        attributes.y = 0;
        attributes.dimAmount = 0.16f;
        window.setAttributes(attributes);
    }

    private void applyThemePalette() {
        ControlerWidgetRenderer.ThemePalette palette =
            ControlerWidgetRenderer.loadThemePalette(this);
        themedSurfaceColor = palette.surfaceColor;
        themedOutlineColor = resolveWidgetCardBorderColor(palette);
        themedFieldFillColor =
            blendColors(palette.surfaceColor, palette.backgroundColor, 0.18f);
        themedBodyColor = palette.bodyColor;
        themedSubtitleColor = palette.subtitleColor;
        themedAccentColor = palette.accentColor;
        themedAccentTextColor = palette.accentTextColor;

        if (quickAddCard != null) {
            quickAddCard.setBackground(
                buildRoundedBackground(
                    blendColors(palette.surfaceColor, palette.cardFillColor, 0.3f),
                    themedOutlineColor,
                    22f
                )
            );
            quickAddCard.setElevation(dpToPx(10f));
        }
        if (titleView != null) {
            titleView.setTextColor(palette.titleColor);
        }
        if (detailView != null) {
            detailView.setTextColor(palette.subtitleColor);
        }
        if (nameInput != null) {
            nameInput.setTextColor(palette.bodyColor);
            nameInput.setHintTextColor(applyAlphaToColor(palette.subtitleColor, 186));
            nameInput.setBackground(
                buildRoundedBackground(themedFieldFillColor, themedOutlineColor, 16f)
            );
        }
        if (cancelButton != null) {
            cancelButton.setTextColor(palette.bodyColor);
            cancelButton.setBackground(
                buildRoundedBackground(
                    applyAlphaToColor(palette.surfaceColor, 0),
                    themedOutlineColor,
                    16f
                )
            );
        }
        if (saveButton != null) {
            saveButton.setTextColor(palette.accentTextColor);
            saveButton.setBackground(
                buildRoundedBackground(
                    palette.accentColor,
                    blendColors(palette.accentColor, palette.contrastReferenceColor, 0.18f),
                    16f
                )
            );
        }
        if (savingIndicator != null) {
            savingIndicator.setIndeterminateTintList(ColorStateList.valueOf(palette.accentColor));
        }
        refreshScheduleViews();
    }

    private void refreshScheduleViews() {
        stylePriorityButton(todoPriorityLowButton, "low".equals(todoPriority), "#79af85");
        stylePriorityButton(todoPriorityMediumButton, "medium".equals(todoPriority), "#ed8936");
        stylePriorityButton(todoPriorityHighButton, "high".equals(todoPriority), "#f56565");
        if (todoDueButton != null) {
            todoDueButton.setText(
                TextUtils.isEmpty(todoDueDate)
                    ? "不设置"
                    : "截止 " + formatDateForDisplay(todoDueDate)
            );
            styleFieldButton(todoDueButton, !TextUtils.isEmpty(todoDueDate));
        }
        if (todoDueClearButton != null) {
            styleClearButton(todoDueClearButton);
            todoDueClearButton.setVisibility(
                TextUtils.isEmpty(todoDueDate) ? View.GONE : View.VISIBLE
            );
        }
        if (repeatDailyButton != null) {
            styleSegmentButton(repeatDailyButton, "daily".equals(checkinRepeatType));
        }
        if (repeatWeeklyButton != null) {
            styleSegmentButton(repeatWeeklyButton, "weekly".equals(checkinRepeatType));
        }
        if (checkinWeekdaysShell != null) {
            checkinWeekdaysShell.setVisibility(
                "weekly".equals(checkinRepeatType) ? View.VISIBLE : View.GONE
            );
        }
        if (checkinWeekdaysButton != null) {
            checkinWeekdaysButton.setText(describeWeekdaySelection(checkinRepeatWeekdays));
            styleFieldButton(checkinWeekdaysButton, "weekly".equals(checkinRepeatType));
        }
        if (checkinEndDateButton != null) {
            checkinEndDateButton.setText(
                TextUtils.isEmpty(checkinEndDate)
                    ? "不设置"
                    : "截止 " + formatDateForDisplay(checkinEndDate)
            );
            styleFieldButton(checkinEndDateButton, !TextUtils.isEmpty(checkinEndDate));
        }
        if (checkinEndDateClearButton != null) {
            styleClearButton(checkinEndDateClearButton);
            checkinEndDateClearButton.setVisibility(
                TextUtils.isEmpty(checkinEndDate) ? View.GONE : View.VISIBLE
            );
        }
    }

    private void openDatePickerDialog(String initialDateText, DateSelectionCallback callback) {
        Calendar initialCalendar = calendarFromDateText(initialDateText);
        if (initialCalendar == null) {
            initialCalendar = calendarFromDateText(todayText());
        }
        if (initialCalendar == null) {
            initialCalendar = Calendar.getInstance();
        }
        final Calendar calendar = initialCalendar;
        DatePickerDialog dialog =
            new DatePickerDialog(
                this,
                (view, year, month, dayOfMonth) -> {
                    Calendar selected = Calendar.getInstance();
                    selected.set(Calendar.YEAR, year);
                    selected.set(Calendar.MONTH, month);
                    selected.set(Calendar.DAY_OF_MONTH, dayOfMonth);
                    resetToStartOfDay(selected);
                    if (callback != null) {
                        callback.onDateSelected(dateText(selected));
                    }
                },
                calendar.get(Calendar.YEAR),
                calendar.get(Calendar.MONTH),
                calendar.get(Calendar.DAY_OF_MONTH)
            );
        dialog.show();
    }

    private void openWeekdayPickerDialog() {
        final boolean[] checkedItems = new boolean[WEEKDAY_LABELS.length];
        for (int index = 0; index < WEEKDAY_LABELS.length; index += 1) {
            checkedItems[index] = checkinRepeatWeekdays.contains(Integer.valueOf(index));
        }
        new AlertDialog.Builder(this)
            .setTitle("选择每周重复日期")
            .setMultiChoiceItems(WEEKDAY_LABELS, checkedItems, (dialog, which, isChecked) -> {
                Integer dayValue = Integer.valueOf(which);
                if (isChecked) {
                    if (!checkinRepeatWeekdays.contains(dayValue)) {
                        checkinRepeatWeekdays.add(dayValue);
                    }
                } else {
                    checkinRepeatWeekdays.remove(dayValue);
                }
            })
            .setNegativeButton("取消", null)
            .setPositiveButton("确定", (dialog, which) -> {
                if (checkinRepeatWeekdays.isEmpty()) {
                    checkinRepeatWeekdays.addAll(buildDefaultWeeklyRepeat(todayText()));
                }
                refreshScheduleViews();
            })
            .show();
    }

    private void styleFieldButton(Button button, boolean active) {
        if (button == null) {
            return;
        }
        button.setTextColor(active ? themedAccentTextColor : themedBodyColor);
        button.setBackground(
            buildRoundedBackground(
                active
                    ? blendColors(themedAccentColor, themedSurfaceColor, 0.12f)
                    : themedFieldFillColor,
                active ? themedAccentColor : themedOutlineColor,
                16f
            )
        );
    }

    private void styleSegmentButton(Button button, boolean selected) {
        if (button == null) {
            return;
        }
        button.setTextColor(selected ? themedAccentTextColor : themedBodyColor);
        button.setBackground(
            buildRoundedBackground(
                selected ? themedAccentColor : themedFieldFillColor,
                selected
                    ? blendColors(themedAccentColor, Color.WHITE, 0.18f)
                    : themedOutlineColor,
                16f
            )
        );
    }

    private void stylePriorityButton(Button button, boolean selected, String priorityColorText) {
        if (button == null) {
            return;
        }
        int priorityColor = Color.parseColor(priorityColorText);
        button.setTextColor(selected ? themedAccentTextColor : themedBodyColor);
        button.setBackground(
            buildRoundedBackground(
                selected
                    ? blendColors(priorityColor, themedSurfaceColor, 0.08f)
                    : themedFieldFillColor,
                selected ? priorityColor : themedOutlineColor,
                16f
            )
        );
    }

    private void styleClearButton(Button button) {
        if (button == null) {
            return;
        }
        button.setTextColor(themedSubtitleColor);
        button.setBackground(
            buildRoundedBackground(
                applyAlphaToColor(themedSurfaceColor, 0),
                themedOutlineColor,
                16f
            )
        );
    }

    private void setButtonEnabled(Button button, boolean enabled) {
        if (button == null) {
            return;
        }
        button.setEnabled(enabled);
        button.setAlpha(enabled ? 1f : 0.58f);
    }

    private void refreshTargetWidgets() {
        Context appContext = getApplicationContext();
        ControlerWidgetRenderer.invalidateRenderSourceCache();
        if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            ControlerWidgetRenderer.updateWidgets(
                appContext,
                widgetKind,
                new int[] {appWidgetId}
            );
            int[] siblingWidgetIds = findSiblingWidgetIds(appContext, widgetKind, appWidgetId);
            if (siblingWidgetIds.length > 0) {
                ControlerWidgetRenderer.scheduleUpdateWidgets(
                    appContext,
                    widgetKind,
                    siblingWidgetIds
                );
            }
            return;
        }
        ControlerWidgetRenderer.refreshKind(appContext, widgetKind);
    }

    private static int[] findSiblingWidgetIds(
        Context context,
        String widgetKind,
        int excludedAppWidgetId
    ) {
        if (context == null) {
            return new int[0];
        }
        String normalizedKind = ControlerWidgetKinds.normalize(widgetKind);
        if (TextUtils.isEmpty(normalizedKind)) {
            return new int[0];
        }
        ComponentName componentName =
            ControlerWidgetKinds.componentNameForKind(context, normalizedKind);
        if (componentName == null) {
            return new int[0];
        }
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        if (appWidgetManager == null) {
            return new int[0];
        }
        int[] widgetIds = appWidgetManager.getAppWidgetIds(componentName);
        if (widgetIds == null || widgetIds.length == 0) {
            return new int[0];
        }
        ArrayList<Integer> siblingIds = new ArrayList<>();
        for (int widgetId : widgetIds) {
            if (widgetId != excludedAppWidgetId) {
                siblingIds.add(Integer.valueOf(widgetId));
            }
        }
        int[] result = new int[siblingIds.size()];
        for (int index = 0; index < siblingIds.size(); index += 1) {
            result[index] = siblingIds.get(index).intValue();
        }
        return result;
    }

    private GradientDrawable buildRoundedBackground(int fillColor, int strokeColor, float radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setCornerRadius(dpToPx(radiusDp));
        drawable.setColor(fillColor);
        drawable.setStroke(dpToPx(1.1f), strokeColor);
        return drawable;
    }

    private int resolveWidgetCardBorderColor(ControlerWidgetRenderer.ThemePalette palette) {
        return blendColors(palette.borderColor, palette.contrastReferenceColor, 0.08f);
    }

    private static int applyAlphaToColor(int color, int alpha) {
        return Color.argb(
            Math.max(0, Math.min(255, alpha)),
            Color.red(color),
            Color.green(color),
            Color.blue(color)
        );
    }

    private static int blendColors(int baseColor, int overlayColor, float overlayAlpha) {
        float clampedAlpha = Math.max(0f, Math.min(1f, overlayAlpha));
        float inverseAlpha = 1f - clampedAlpha;
        int red = Math.round(
            Color.red(baseColor) * inverseAlpha + Color.red(overlayColor) * clampedAlpha
        );
        int green = Math.round(
            Color.green(baseColor) * inverseAlpha + Color.green(overlayColor) * clampedAlpha
        );
        int blue = Math.round(
            Color.blue(baseColor) * inverseAlpha + Color.blue(overlayColor) * clampedAlpha
        );
        return Color.rgb(
            Math.max(0, Math.min(255, red)),
            Math.max(0, Math.min(255, green)),
            Math.max(0, Math.min(255, blue))
        );
    }

    private int dpToPx(float dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private void saveTodo(String title) throws Exception {
        JSONObject coreState = ControlerWidgetDataStore.getStorageCoreState(this);
        JSONArray todos = coreState.optJSONArray("todos");
        if (todos == null) {
            todos = new JSONArray();
        }
        String today = todayText();
        JSONObject todo = new JSONObject();
        todo.put("id", generateId("todo_"));
        todo.put("title", title);
        todo.put("description", "");
        todo.put("priority", todoPriority);
        todo.put("tags", new JSONArray());
        todo.put("projectId", JSONObject.NULL);
        todo.put("createdAt", isoNow());
        todo.put("completed", false);
        todo.put("completedAt", JSONObject.NULL);
        todo.put("color", resolveTodoPriorityColor(todoPriority));
        todo.put("type", "todo");
        todo.put("repeatType", "none");
        todo.put("repeatWeekdays", new JSONArray());
        todo.put("dueDate", TextUtils.isEmpty(todoDueDate) ? "" : todoDueDate);
        todo.put("startDate", TextUtils.isEmpty(todoDueDate) ? today : todoDueDate);
        todo.put("endDate", "");
        todo.put("notification", JSONObject.NULL);
        todos.put(todo);

        JSONObject partialCore = new JSONObject();
        partialCore.put("todos", todos);
        ControlerWidgetDataStore.replaceStorageCoreState(this, partialCore);
    }

    private void saveCheckin(String title) throws Exception {
        JSONObject coreState = ControlerWidgetDataStore.getStorageCoreState(this);
        JSONArray checkinItems = coreState.optJSONArray("checkinItems");
        if (checkinItems == null) {
            checkinItems = new JSONArray();
        }
        String today = todayText();
        JSONArray repeatWeekdays = new JSONArray();
        if ("weekly".equals(checkinRepeatType)) {
            ArrayList<Integer> weekdays =
                checkinRepeatWeekdays.isEmpty()
                    ? buildDefaultWeeklyRepeat(today)
                    : new ArrayList<>(checkinRepeatWeekdays);
            for (Integer weekday : weekdays) {
                if (weekday == null) {
                    continue;
                }
                int value = weekday.intValue();
                if (value >= 0 && value <= 6) {
                    repeatWeekdays.put(value);
                }
            }
        }

        JSONObject item = new JSONObject();
        item.put("id", generateId("checkin_"));
        item.put("title", title);
        item.put("description", "");
        item.put("color", "#4299e1");
        item.put("repeatType", "weekly".equals(checkinRepeatType) ? "weekly" : "daily");
        item.put("repeatWeekdays", repeatWeekdays);
        item.put("startDate", today);
        item.put("endDate", TextUtils.isEmpty(checkinEndDate) ? "" : checkinEndDate);
        item.put("createdAt", isoNow());
        item.put("type", "checkin");
        item.put("notification", JSONObject.NULL);
        checkinItems.put(item);

        JSONObject partialCore = new JSONObject();
        partialCore.put("checkinItems", checkinItems);
        ControlerWidgetDataStore.replaceStorageCoreState(this, partialCore);
    }

    private static String formatDateForDisplay(String dateText) {
        Calendar calendar = calendarFromDateText(dateText);
        if (calendar == null) {
            return safeText(dateText);
        }
        return (calendar.get(Calendar.MONTH) + 1)
            + "月"
            + calendar.get(Calendar.DAY_OF_MONTH)
            + "日";
    }

    private static ArrayList<Integer> buildDefaultWeeklyRepeat(String dateText) {
        ArrayList<Integer> weekdays = new ArrayList<>();
        Calendar calendar = calendarFromDateText(dateText);
        if (calendar == null) {
            calendar = Calendar.getInstance();
        }
        weekdays.add(Integer.valueOf(calendar.get(Calendar.DAY_OF_WEEK) - 1));
        return weekdays;
    }

    private static String describeWeekdaySelection(ArrayList<Integer> weekdays) {
        if (weekdays == null || weekdays.isEmpty()) {
            return "选择星期";
        }
        ArrayList<Integer> sorted = new ArrayList<>(weekdays);
        Collections.sort(sorted);
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < sorted.size(); index += 1) {
            int day = Math.max(0, Math.min(WEEKDAY_LABELS.length - 1, sorted.get(index)));
            if (builder.length() > 0) {
                builder.append("、");
            }
            builder.append(WEEKDAY_LABELS[day]);
        }
        return builder.toString();
    }

    private static String resolveTodoPriorityColor(String priority) {
        if ("high".equals(priority)) {
            return "#f56565";
        }
        if ("medium".equals(priority)) {
            return "#ed8936";
        }
        return "#79af85";
    }

    private static String generateId(String prefix) {
        return prefix
            + Long.toString(System.currentTimeMillis(), 36)
            + Integer.toHexString((int) (Math.random() * 0xFFFFFF));
    }

    private static String isoNow() {
        return formatIso(System.currentTimeMillis());
    }

    private static String formatIso(long millis) {
        SimpleDateFormat format =
            new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis));
    }

    private static String todayText() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date());
    }

    private static Calendar calendarFromDateText(String dateText) {
        return ControlerWidgetDataStore.calendarFromDateText(dateText);
    }

    private static String dateText(Calendar calendar) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(calendar.getTime());
    }

    private static void resetToStartOfDay(Calendar calendar) {
        if (calendar == null) {
            return;
        }
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
    }

    private static String safeText(String text) {
        return text == null ? "" : text;
    }
}
