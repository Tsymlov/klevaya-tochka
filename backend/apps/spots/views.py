from django.contrib.gis.geos import Polygon
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.viewsets import ModelViewSet

from apps.spots.models import FishingSpot
from apps.spots.permissions import IsOwnerOrReadOnly
from apps.spots.serializers import FishingSpotSerializer


class SpotReadThrottle(AnonRateThrottle):
    rate = "120/min"


class SpotWriteThrottle(UserRateThrottle):
    rate = "10/hour"


class FishingSpotViewSet(ModelViewSet):
    queryset = FishingSpot.objects.select_related("owner").all()
    serializer_class = FishingSpotSerializer
    permission_classes = (IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly)

    def get_throttles(self):
        if self.action in {"list", "retrieve"}:
            throttle_classes = (SpotReadThrottle,)
        else:
            throttle_classes = (SpotWriteThrottle,)
        return [throttle() for throttle in throttle_classes]

    def get_queryset(self):
        queryset = super().get_queryset().filter(status=FishingSpot.Status.ACTIVE)
        bbox = self.request.query_params.get("bbox")
        if not bbox:
            return queryset

        try:
            min_lng, min_lat, max_lng, max_lat = [float(value) for value in bbox.split(",")]
        except ValueError:
            return queryset.none()

        if not (-180 <= min_lng <= 180 and -180 <= max_lng <= 180):
            return queryset.none()
        if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
            return queryset.none()

        boundary = Polygon.from_bbox((min_lng, min_lat, max_lng, max_lat))
        boundary.srid = 4326
        return queryset.filter(location__within=boundary)

    def perform_create(self, serializer: FishingSpotSerializer) -> None:
        serializer.save(owner=self.request.user)
