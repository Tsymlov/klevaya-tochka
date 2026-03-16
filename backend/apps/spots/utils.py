from apps.spots.models import FishingSpot


def serialize_spot(spot: FishingSpot) -> dict:
    return {
        "id": spot.id,
        "owner": spot.owner.username,
        "is_owner": False,
        "description": spot.description,
        "location": {
            "lat": spot.location.y,
            "lng": spot.location.x,
        },
        "created_at": spot.created_at.isoformat(),
        "updated_at": spot.updated_at.isoformat(),
    }
