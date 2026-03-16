from django.contrib.gis.geos import Point
from rest_framework import serializers

from apps.spots.models import FishingSpot


class FishingSpotSerializer(serializers.ModelSerializer):
    latitude = serializers.FloatField(write_only=True, required=False)
    longitude = serializers.FloatField(write_only=True, required=False)
    location = serializers.SerializerMethodField(read_only=True)
    owner = serializers.CharField(source="owner.username", read_only=True)
    is_owner = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = FishingSpot
        fields = (
            "id",
            "owner",
            "is_owner",
            "description",
            "location",
            "latitude",
            "longitude",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "owner", "location", "created_at", "updated_at")

    def get_location(self, obj: FishingSpot) -> dict[str, float]:
        return {
            "lat": obj.location.y,
            "lng": obj.location.x,
        }

    def get_is_owner(self, obj: FishingSpot) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and obj.owner_id == user.id)

    def validate(self, attrs):
        description = attrs.get("description")
        latitude = attrs.pop("latitude", None)
        longitude = attrs.pop("longitude", None)

        if description is not None:
            description = description.strip()
            if not description:
                raise serializers.ValidationError("Описание точки не может быть пустым.")
            attrs["description"] = description

        if self.instance is None and (latitude is None or longitude is None):
            raise serializers.ValidationError("Для создания точки нужны latitude и longitude.")

        if latitude is not None or longitude is not None:
            if latitude is None or longitude is None:
                raise serializers.ValidationError("Координаты должны передаваться парой.")
            if not -90 <= latitude <= 90:
                raise serializers.ValidationError("Широта должна быть в диапазоне от -90 до 90.")
            if not -180 <= longitude <= 180:
                raise serializers.ValidationError("Долгота должна быть в диапазоне от -180 до 180.")
            attrs["location"] = Point(longitude, latitude, srid=4326)

        return attrs
