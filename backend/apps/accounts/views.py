from django.contrib.auth import login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from apps.accounts.serializers import LoginSerializer, RegisterSerializer


class AuthBurstThrottle(AnonRateThrottle):
    rate = "15/hour"


class AuthSessionThrottle(UserRateThrottle):
    rate = "30/hour"


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfCookieView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (AuthBurstThrottle,)

    def get(self, _request):
        return Response({"detail": "CSRF cookie set."})


class RegisterView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (AuthBurstThrottle,)

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user)
        return Response(
            {
                "is_authenticated": True,
                "username": user.username,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (AuthBurstThrottle,)

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        login(request, user)
        return Response(
            {
                "is_authenticated": True,
                "username": user.username,
            }
        )


class LogoutView(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_classes = (AuthSessionThrottle,)

    def post(self, request):
        logout(request)
        return Response({"is_authenticated": False, "username": None})


class MeView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        if request.user.is_authenticated:
            return Response(
                {
                    "is_authenticated": True,
                    "username": request.user.username,
                }
            )
        return Response({"is_authenticated": False, "username": None})
