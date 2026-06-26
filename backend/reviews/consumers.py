import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

class ReviewsConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.group_name = "reviews_group"
        
        # Join group
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )
        
        await self.accept()
        logger.info(f"WebSocket client connected: {self.channel_name}")
        
        # Send initial success connection acknowledge
        await self.send(text_data=json.dumps({
            'type': 'CONNECTION_ESTABLISHED',
            'message': 'Connected to Automated Code Review WebSocket channel'
        }))

    async def disconnect(self, close_code):
        # Leave group
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )
        logger.info(f"WebSocket client disconnected: {self.channel_name}")

    async def receive(self, text_data):
        # Client to Server message handling / signaling relay
        try:
            data = json.loads(text_data)
            if data.get('type') == 'ping':
                await self.send(text_data=json.dumps({'type': 'pong'}))
                return
                
            # Relay chat, signaling, and call events to everyone in the group
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "review.message",
                    "message": data
                }
            )
        except Exception as e:
            logger.error(f"WebSocket error processing receive: {e}")

    async def review_message(self, event):
        """
        Receive event from group and transmit down to individual socket client
        """
        message = event['message']
        await self.send(text_data=json.dumps(message))
