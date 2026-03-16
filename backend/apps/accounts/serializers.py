from django.contrib.auth import authenticate, get_user_model, password_validation
from rest_framework import serializers

User = get_user_model()


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8, style={"input_type": "password"})
    password_confirm = serializers.CharField(
        write_only=True,
        min_length=8,
        style={"input_type": "password"},
    )

    def validate_username(self, value: str) -> str:
        username = value.strip()
        if not username:
            raise serializers.ValidationError("Имя пользователя не может быть пустым.")
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("Пользователь с таким именем уже существует.")
        return username

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError("Пароли не совпадают.")

        password_validation.validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
        )


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        username = attrs.get("username", "").strip()
        password = attrs.get("password", "")
        user = authenticate(
            request=self.context.get("request"),
            username=username,
            password=password,
        )
        if user is None:
            raise serializers.ValidationError("Неверное имя пользователя или пароль.")
        attrs["user"] = user
        return attrs
