from django.urls import path

from apps.spots.consumers import SpotsConsumer

websocket_urlpatterns = [
    path("ws/spots/", SpotsConsumer.as_asgi()),
]
