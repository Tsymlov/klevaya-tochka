from django.contrib import admin

from apps.spots.models import FishingSpot


@admin.register(FishingSpot)
class FishingSpotAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "status", "short_description", "created_at")
    list_filter = ("status", "created_at", "updated_at")
    search_fields = ("description", "owner__username")
    readonly_fields = ("created_at", "updated_at")

    @staticmethod
    def short_description(obj: FishingSpot) -> str:
        return obj.description[:60]
