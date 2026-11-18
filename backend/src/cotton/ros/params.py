from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol, cast

from cotton.ros.thread import RosCallError, RosThread


class ParamsNode(Protocol):
    def create_client(self, srv_type: Any, srv_name: str) -> Any: ...

    def destroy_client(self, client: Any) -> None: ...


class ParamsSource(Protocol):
    def get_all(self, node_name: str, timeout: float = 5.0) -> dict[str, Any]: ...

    def set(self, node_name: str, name: str, value: Any, timeout: float = 5.0) -> None: ...


def coerce_value(current: Any, new: Any) -> tuple[str, Any]:
    """Convert a JSON value to the type the parameter already has."""
    type_name = _declared_type(current, new)
    return type_name, _convert(type_name, new)


def _declared_type(current: Any, new: Any) -> str:
    if isinstance(current, bool):
        return "bool"
    if isinstance(current, int):
        return "integer"
    if isinstance(current, float):
        return "double"
    if isinstance(current, str):
        return "string"
    if isinstance(current, bytes):
        return "byte_array"
    if isinstance(current, (list, tuple)):
        items = list(current)
        if not items and isinstance(new, (list, tuple)):
            items = list(new)
        return _array_type(items)
    raise ValueError(f"unsupported parameter type: {type(current).__name__}")


def _array_type(items: list[Any]) -> str:
    return f"{_declared_type(items[0], items[0])}_array" if items else "string_array"


def _convert(type_name: str, new: Any) -> Any:
    try:
        return _CONVERTERS[type_name](new)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"expected {type_name}, got {new!r}") from exc


def _to_bool(new: Any) -> bool:
    if not isinstance(new, bool):
        raise TypeError
    return new


def _to_integer(new: Any) -> int:
    if isinstance(new, bool) or isinstance(new, float):
        raise TypeError
    return int(new)


def _to_double(new: Any) -> float:
    if isinstance(new, bool):
        raise TypeError
    return float(new)


def _to_string(new: Any) -> str:
    if not isinstance(new, str):
        raise TypeError
    return new


def _to_byte_array(new: Any) -> bytes:
    if isinstance(new, bytes):
        return new
    if not isinstance(new, list):
        raise TypeError
    return bytes(new)


def _to_array(element: str) -> Callable[[Any], list[Any]]:
    def convert(new: Any) -> list[Any]:
        if not isinstance(new, (list, tuple)):
            raise TypeError
        return [_convert(element, item) for item in new]

    return convert


_CONVERTERS: dict[str, Callable[[Any], Any]] = {
    "bool": _to_bool,
    "integer": _to_integer,
    "double": _to_double,
    "string": _to_string,
    "byte_array": _to_byte_array,
    "bool_array": _to_array("bool"),
    "integer_array": _to_array("integer"),
    "double_array": _to_array("double"),
    "string_array": _to_array("string"),
}

_ARRAY_FIELDS = {
    "byte_array_value",
    "bool_array_value",
    "integer_array_value",
    "double_array_value",
    "string_array_value",
}


class RemoteParams:
    """Reads and writes the parameters of another node; call it inside the ROS thread."""

    def __init__(self, node: ParamsNode) -> None:
        self._node = node

    def get_all(self, node_name: str, timeout: float = 5.0) -> dict[str, Any]:
        from rcl_interfaces.srv import GetParameters, ListParameters

        list_request = ListParameters.Request()
        list_request.depth = 0
        listed = self._call(node_name, "list_parameters", ListParameters, list_request, timeout)
        names = [str(name) for name in listed.result.names]
        if not names:
            return {}
        request = GetParameters.Request()
        request.names = names
        response = self._call(node_name, "get_parameters", GetParameters, request, timeout)
        return {
            name: _plain_value(value) for name, value in zip(names, response.values, strict=True)
        }

    def set(self, node_name: str, name: str, value: Any, timeout: float = 5.0) -> None:
        from rcl_interfaces.srv import SetParameters

        current = self.get_all(node_name, timeout).get(name)
        if current is None:
            raise RosCallError(
                f"parameter {name} is not declared on {node_name}", code="param_not_settable"
            )
        type_name, coerced = coerce_value(current, value)
        request = SetParameters.Request()
        request.parameters = [_parameter(name, type_name, coerced)]
        response = self._call(node_name, "set_parameters", SetParameters, request, timeout)
        result = response.results[0]
        if not result.successful:
            raise RosCallError(
                result.reason or f"parameter {name} is read-only", code="param_not_settable"
            )

    def _call(
        self, node_name: str, service: str, srv_type: Any, request: Any, timeout: float
    ) -> Any:
        import rclpy

        client = self._node.create_client(srv_type, f"{node_name}/{service}")
        try:
            if not client.wait_for_service(timeout_sec=timeout):
                raise RosCallError(f"node {node_name} is not available", code="node_not_found")
            future = client.call_async(request)
            rclpy.spin_until_future_complete(cast(Any, self._node), future, timeout_sec=timeout)
            if future.exception() is not None:
                raise RosCallError(
                    f"{service} on {node_name} failed: {future.exception()}", code="node_not_found"
                )
            if not future.done():
                raise RosCallError(f"{service} on {node_name} timed out", code="node_not_found")
            return future.result()
        finally:
            self._node.destroy_client(client)


class ThreadParamsSource:
    """Resolves the ROS node lazily so the router can be built before startup."""

    def __init__(self, ros: RosThread) -> None:
        self._ros = ros

    def get_all(self, node_name: str, timeout: float = 5.0) -> dict[str, Any]:
        return self._params().get_all(node_name, timeout)

    def set(self, node_name: str, name: str, value: Any, timeout: float = 5.0) -> None:
        self._params().set(node_name, name, value, timeout)

    def _params(self) -> RemoteParams:
        node = self._ros.node
        if node is None:
            raise RosCallError("the ROS thread is not running")
        return RemoteParams(node)


def _parameter(name: str, type_name: str, value: Any) -> Any:
    from rcl_interfaces.msg import Parameter, ParameterType, ParameterValue

    parameter_value = ParameterValue()
    parameter_value.type = getattr(ParameterType, f"PARAMETER_{type_name.upper()}")
    setattr(parameter_value, f"{type_name}_value", value)
    parameter = Parameter()
    parameter.name = name
    parameter.value = parameter_value
    return parameter


def _plain_value(value: Any) -> Any:
    from rcl_interfaces.msg import ParameterType

    fields = {
        ParameterType.PARAMETER_BOOL: "bool_value",
        ParameterType.PARAMETER_INTEGER: "integer_value",
        ParameterType.PARAMETER_DOUBLE: "double_value",
        ParameterType.PARAMETER_STRING: "string_value",
        ParameterType.PARAMETER_BYTE_ARRAY: "byte_array_value",
        ParameterType.PARAMETER_BOOL_ARRAY: "bool_array_value",
        ParameterType.PARAMETER_INTEGER_ARRAY: "integer_array_value",
        ParameterType.PARAMETER_DOUBLE_ARRAY: "double_array_value",
        ParameterType.PARAMETER_STRING_ARRAY: "string_array_value",
    }
    field = fields.get(value.type)
    if field is None:
        return None
    data = getattr(value, field)
    return list(data) if field in _ARRAY_FIELDS else data
