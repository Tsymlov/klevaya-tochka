from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.spots.models import FishingSpot
from apps.spots.utils import serialize_spot

SPOTS_GROUP = "spots_stream"


@receiver(post_save, sender=FishingSpot)
def broadcast_saved_spot(_sender, instance: FishingSpot, created: bool, **_kwargs) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        SPOTS_GROUP,
        {
            "type": "spot_event",
            "payload": {
                "type": "spot.event",
                "event": "created" if created else "updated",
                "spot": serialize_spot(instance),
            },
        },
    )


@receiver(post_delete, sender=FishingSpot)
def broadcast_deleted_spot(_sender, instance: FishingSpot, **_kwargs) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    async_to_sync(channel_layer.group_send)(
        SPOTS_GROUP,
        {
            "type": "spot_event",
            "payload": {
                "type": "spot.event",
                "event": "deleted",
                "spot": {"id": instance.id},
            },
        },
    )
