"""
Funções do app trajectory-coordinate-converter, transcritas sem alteração para os testes de paridade.
As demais páginas do conversor só chamam o pymap3d, que os testes usam diretamente como referência.
"""

import re

import numpy as np


# source/pages/01_Grau_GMS_-_Grau_Decimal.py
def dms_to_dd(dms_str):
    dms_str = dms_str.strip()
    sign = -1 if dms_str[0] == "-" else 1
    dms_str = dms_str[1:] if sign == -1 else dms_str
    d, m, s = re.split("[°'\"]", dms_str)[:3]
    return sign * (float(d) + float(m) / 60 + float(s) / 3600)


# source/pages/01_Grau_GMS_-_Grau_Decimal.py
def dd_to_dms_string(decimal_degrees):
    is_positive = decimal_degrees >= 0
    decimal_degrees = abs(decimal_degrees)

    degrees = int(decimal_degrees)
    minutes = int((decimal_degrees - degrees) * 60)
    seconds = (decimal_degrees - degrees - minutes / 60) * 3600

    sign = "" if is_positive else "-"
    return f"{sign}{degrees}°{minutes}'{seconds:.6f}\""


# source/pages/06_Velocidade,_Aceleração.py (calculate_velocity_acceleration, só os cálculos)
def velocity_acceleration(x, sampling_time):
    velocity = np.gradient(x, sampling_time)
    acceleration = np.gradient(velocity, sampling_time)
    return velocity, acceleration
