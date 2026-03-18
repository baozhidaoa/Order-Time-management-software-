package com.controlerapp;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public class ControlerNotificationReceiver extends BroadcastReceiver {
    public static final String ACTION_SHOW_REMINDER =
        "com.controlerapp.action.SHOW_REMINDER";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }

        String action = intent.getAction();
        if (ACTION_SHOW_REMINDER.equals(action)) {
            showReminderNotification(context, intent);
            ControlerNotificationScheduler.rescheduleAll(context);
            return;
        }

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            || Intent.ACTION_TIME_CHANGED.equals(action)
            || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            ControlerNotificationScheduler.rescheduleAll(context);
        }
    }

    private void showReminderNotification(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return;
        }

        ControlerNotificationScheduler.ensureNotificationChannel(context);

        int notificationId = intent.getIntExtra("notification_id", 0);
        String title = intent.getStringExtra("notification_title");
        String message = intent.getStringExtra("notification_message");
        int color = intent.getIntExtra("notification_color", 0);
        String type = intent.getStringExtra("notification_type");
        String itemId = intent.getStringExtra("notification_item_id");
        String occurrenceDateText = intent.getStringExtra("notification_occurrence_date");
        long reminderAtMillis = intent.getLongExtra("notification_reminder_at", 0L);

        if (
            !ControlerNotificationScheduler.shouldDeliverReminder(
                context,
                type,
                itemId,
                occurrenceDateText,
                reminderAtMillis
            )
        ) {
            return;
        }

        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent =
            PendingIntent.getActivity(
                context,
                notificationId,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(context, ControlerNotificationScheduler.CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title == null ? "提醒" : title)
                .setContentText(message == null ? "" : message)
                .setStyle(
                    new NotificationCompat.BigTextStyle().bigText(
                        message == null ? "" : message
                    )
                )
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setColorized(true)
                .setColor(color);

        NotificationManagerCompat notificationManager = NotificationManagerCompat.from(context);
        notificationManager.notify(notificationId, builder.build());
    }
}
