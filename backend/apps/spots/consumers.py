from channels.generic.websocket import AsyncJsonWebsocketConsumer


class SpotsConsumer(AsyncJsonWebsocketConsumer):
    group_name = "spots_stream"

    async def connect(self):
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connection.ready"})

    async def disconnect(self, _close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def spot_event(self, event):
        await self.send_json(event["payload"])
