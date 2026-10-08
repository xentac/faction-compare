"use client";
import { useCallback, useEffect, useState } from "react";
import { LoginForm } from "./login-form";
import {
  FFScouterResult,
  keys,
  factionIds,
  TornFactionBasicApi,
  factionWarId,
} from "./types";
import { Loader } from "lucide-react";
import { MyChart } from "./chart";
import { Button } from "@/components/ui/button";
import { FactionInputForm } from "./faction-input-form";
import { FactionWarInputForm } from "./faction-war-input-form";
import { tornFactionUrl } from "./data-policy";

const getKeys = (): keys | undefined => {
  // We need this because window / localstorage might not exist as fast yet (for the first mount)
  if (!window) {
    return undefined;
  }
  const v = localStorage.getItem("keys");
  if (v == null) {
    return undefined;
  }
  try {
    const j = JSON.parse(v) as keys;
    if (j.ffScouterKey) {
      return j;
    }
  } catch (e) {
    console.log("Error parsing stored keys:", e);
    localStorage.removeItem("keys");
    return undefined;
  }
  return undefined;
};
const getFactionIds = (): factionIds | undefined => {
  // We need this because window / localstorage might not exist as fast yet (for the first mount)
  if (!window) {
    return undefined;
  }
  const v = localStorage.getItem("factionIds");
  console.log(v);
  if (v == null) {
    return undefined;
  }
  try {
    const j = JSON.parse(v) as factionIds;
    if (j.leftFactionId && j.rightFactionId) {
      return j;
    }
  } catch (e) {
    console.log("Error parsing stored keys:", e);
    localStorage.removeItem("factionIds");
    return undefined;
  }
  return undefined;
};

export default function SPA() {
  const [keys, setKeys] = useState<keys>();
  const [factionIds, setFactionIds] = useState<factionIds>();
  const [factionWarId, setFactionWarId] = useState<factionWarId>();
  const [rightFFScouterData, setRightFFScouterData] =
    useState<FFScouterResult>();
  //make sure to pass types here just as above
  const [leftFFScouterData, setLeftFFScouterData] = useState<FFScouterResult>();
  const [leftFactionBasic, setLeftFactionBasic] =
    useState<TornFactionBasicApi>();
  const [rightFactionBasic, setRightFactionBasic] =
    useState<TornFactionBasicApi>();

  const setFactionIdsPersist = (i: factionIds | undefined) => {
    setFactionIds(i);
    if (!i) {
      localStorage.removeItem("factionIds");
      return;
    }
    localStorage.setItem("factionIds", JSON.stringify(i));
  };

  const setFactionWarIdPersist = (i: factionWarId | undefined) => {
    setFactionWarId(i);
    if (!i) {
      localStorage.removeItem("factionWarId");
      return;
    }
    localStorage.setItem("factionWarId", JSON.stringify(i));
  };

  //we need this because it should run after each time the component updates, or in this case, when window gets mounted.
  //thats the cleanest way of doing things i think
  useEffect(() => {
    setKeys(getKeys());
    setFactionIds(getFactionIds());
  }, []);

  const logout = () => {
    localStorage.removeItem("keys");
    setKeys(undefined);
  };

  const reset = useCallback(() => {
    setFactionIdsPersist(undefined);
    setFactionWarIdPersist(undefined);
    setLeftFFScouterData(undefined);
    setRightFFScouterData(undefined);
    setLeftFactionBasic(undefined);
    setRightFactionBasic(undefined);
  }, []);

  useEffect(() => {
    if (!keys || !factionWarId) {
      return;
    }
    fetch(tornFactionUrl(factionWarId.factionWarId, keys.ffScouterKey))
      .then((res) => res.json())
      .then((value) => TornFactionBasicApi.parse(value))
      .then((value: TornFactionBasicApi) => {
        if (!value.ranked_wars) {
          reset();
          return;
        }
        console.log(value.ranked_wars);
        let found = false;
        for (const warId in value.ranked_wars) {
          found = true;
          const war = value.ranked_wars[warId];
          if (!war || !war.factions) {
            reset();
            return;
          }
          const ids = [];
          for (const factionId in war.factions) {
            ids.push(factionId);
          }
          if (ids.length != 2) {
            reset();
            return;
          }
          setFactionIdsPersist({
            leftFactionId: ids[0],
            rightFactionId: ids[1],
          });
        }
        if (!found) {
          reset();
        }
      })
      .catch((e) => {
        console.log(e);
        reset();
      }); // TODO: Tell them something
  }, [keys, factionWarId, reset]);

  useEffect(() => {
    if (!keys || !factionIds) {
      return;
    }
    fetch(tornFactionUrl(factionIds.leftFactionId, keys.ffScouterKey))
      .then((res) => res.json())
      .then((value) => TornFactionBasicApi.parse(value))
      .then((value: TornFactionBasicApi) => setLeftFactionBasic(value))
      .catch((e) => {
        console.log(e);
        reset();
      }); // TODO: Tell them something

    fetch(tornFactionUrl(factionIds.rightFactionId, keys.ffScouterKey))
      .then((res) => res.json())
      .then((value) => TornFactionBasicApi.parse(value))
      .then((value: TornFactionBasicApi) => setRightFactionBasic(value))
      .catch((e) => {
        console.log(e);
        reset();
      }); // TODO: Tell them something
  }, [keys, factionIds, reset]);

  //run this every time keys changes
  useEffect(() => {
    if (!keys || !leftFactionBasic) {
      return;
    }
    //expand for every api call
    const query = new URLSearchParams({
      key: keys.ffScouterKey,
      targets: Object.keys(leftFactionBasic.members).join(","),
    });
    fetch("https://ffscouter.com/api/v1/get-stats?" + query.toString())
      .then((res) => res.json())
      .then((value) => FFScouterResult.parse(value))
      .then((value: FFScouterResult) => setLeftFFScouterData(value))
      .catch((e) => {
        console.log(e);
        reset();
      }); // TODO: Tell them something
  }, [keys, leftFactionBasic, reset]);

  useEffect(() => {
    if (!keys || !rightFactionBasic) {
      return;
    }
    //expand for every api call
    const query = new URLSearchParams({
      key: keys.ffScouterKey,
      targets: Object.keys(rightFactionBasic.members).join(","),
    });
    fetch("https://ffscouter.com/api/v1/get-stats?" + query.toString())
      .then((res) => res.json())
      .then((value) => FFScouterResult.parse(value))
      .then((value: FFScouterResult) => setRightFFScouterData(value))
      .catch((e) => {
        console.log(e);
        reset();
      }); // TODO: Tell them something
  }, [keys, rightFactionBasic, reset]);

  if (!keys) {
    return (
      <div className="grid grid-cols-1 items-center lg:grid-cols-3 mt-5 mx-5">
        <LoginForm
          className="w-full lg:col-start-2"
          setKeys={setKeys}
        ></LoginForm>
      </div>
    );
  }

  if (!factionIds && !factionWarId) {
    return (
      <>
        <div className="grid grid-cols-1 justify-items-end mt-5 mx-5">
          <Button onClick={logout}>Logout</Button>
        </div>
        <div className="grid grid-cols-1 items-center lg:grid-cols-3 mt-5 mx-5">
          <FactionInputForm
            className="w-full lg:col-start-2"
            setFactionIds={setFactionIdsPersist}
          ></FactionInputForm>
        </div>
        <div className="grid grid-cols-1 items-center lg:grid-cols-3 mt-5 mx-5">
          <FactionWarInputForm
            className="w-full lg:col-start-2"
            setFactionWarId={setFactionWarIdPersist}
          ></FactionWarInputForm>
        </div>
      </>
    );
  }

  if (
    !leftFactionBasic ||
    !rightFactionBasic ||
    !rightFFScouterData ||
    !leftFFScouterData
  ) {
    return (
      <div className="container mx-auto grow flex items-center">
        <Loader className="animate-spin w-full"></Loader>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-5 mt-5 mx-5">
        <div>
          <Button onClick={reset}>Reset</Button>
        </div>
        <div className="justify-self-end">
          <Button onClick={logout}>Logout</Button>
        </div>
      </div>
      <div>
        <MyChart
          leftffscouterdata={leftFFScouterData}
          rightffscouterdata={rightFFScouterData}
          leftfactionbasic={leftFactionBasic}
          rightfactionbasic={rightFactionBasic}
        />
      </div>
    </>
  );
}
