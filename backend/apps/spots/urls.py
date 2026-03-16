from rest_framework.routers import DefaultRouter

from apps.spots.views import FishingSpotViewSet

router = DefaultRouter()
router.register("", FishingSpotViewSet, basename="spots")

urlpatterns = router.urls
