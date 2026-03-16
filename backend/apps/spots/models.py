from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.db import models


class FishingSpot(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        HIDDEN = "hidden", "Hidden"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="fishing_spots",
    )
    description = models.TextField(max_length=1000)
    location = gis_models.PointField(geography=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.owner} @ {self.created_at:%Y-%m-%d %H:%M}"
