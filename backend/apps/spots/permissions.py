from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsOwnerOrReadOnly(BasePermission):
    def has_object_permission(self, request, _view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True
        return obj.owner_id == request.user.id
